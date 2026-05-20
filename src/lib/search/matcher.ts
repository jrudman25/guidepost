import { generateWithFallback } from "@/lib/gemini";
import type { ParsedResumeData } from "@/lib/types";
import type { PipelineLogger } from "@/lib/pipeline-logger";

export interface MatchResult {
    score: number;
    reasoning: string;
}

const BATCH_MATCH_PROMPT = `You are a job matching expert. Score how well each job listing below matches a candidate's resume.

Candidate Profile:
- Job Titles: {titles}
- Skills: {skills}
- Years of Experience: {experience}
- Industries: {industries}
- Target Seniority: {seniority}

{jobListings}

Score EACH job from 0 to 100 based on:
- Skills overlap (40% weight)
- Role/title alignment (20% weight)
- Seniority/experience level match (30% weight)
- Industry relevance (10% weight)

Seniority matching rules:
- If the candidate targets "entry" level roles and the job requires senior-level experience (e.g., 5+ years, "lead", "architect", "principal", "staff"), reduce the score significantly (below 30).
- If the candidate has minimal experience and the job is clearly senior, staff, principal, lead, architect, manager, or requires 4+ years of experience, score it below 25.
- If the candidate targets "senior" roles and the job is clearly entry/junior level, reduce the score.
- If the target seniority is "any", treat experience level as a minor factor.
- Do not treat future cohort or start dates (for example, "2026 Start") as an experience mismatch unless the listing explicitly conflicts with the candidate's availability.
- Each reasoning must be standalone. Do not reference other listings or labels like "Job 1".

Return ONLY a valid JSON array (no markdown, no code blocks). Each element must correspond to the same job index above:
[
  { "score": <number 0-100>, "reasoning": "<2-sentence explanation>" },
  ...
]`;

const SINGLE_MATCH_PROMPT = `You are a job matching expert. Score how well a job listing matches a candidate's resume.

Candidate Profile:
- Job Titles: {titles}
- Skills: {skills}  
- Years of Experience: {experience}
- Industries: {industries}
- Target Seniority: {seniority}

Job Listing:
Title: {jobTitle}
Company: {company}
Description: {description}

Score this job from 0 to 100 based on:
- Skills overlap (40% weight)
- Role/title alignment (20% weight)
- Seniority/experience level match (30% weight)
- Industry relevance (10% weight)

Seniority matching rules:
- If the candidate targets "entry" level roles and the job requires senior-level experience (e.g., 5+ years, "lead", "architect", "principal", "staff"), reduce the score significantly (below 30).
- If the candidate has minimal experience and the job is clearly senior, staff, principal, lead, architect, manager, or requires 4+ years of experience, score it below 25.
- If the candidate targets "senior" roles and the job is clearly entry/junior level, reduce the score.
- If the target seniority is "any", treat experience level as a minor factor.
- Do not treat future cohort or start dates (for example, "2026 Start") as an experience mismatch unless the listing explicitly conflicts with the candidate's availability.
- The reasoning must be standalone. Do not reference other listings or labels like "Job 1".

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "score": <number 0-100>,
  "reasoning": "<2-sentence explanation of the score>"
}`;

const SENIORITY_LABELS: Record<string, string> = {
    entry: "Entry Level / Junior",
    mid: "Mid Level",
    senior: "Senior",
    any: "Any level",
};

const BATCH_SIZE = 5;
const LARGE_EXPERIENCE_GAP_SCORE_CAP = 24;

type JobInput = { title: string; company: string; description: string | null };

function sanitizeReasoning(reasoning: unknown): string {
    const text = typeof reasoning === "string" && reasoning.trim()
        ? reasoning.trim()
        : "Could not generate match score - defaulted to 50.";

    return text
        .replace(/\b(?:just like|similar to|as with|compared with|compared to)\s+job\s+\d+[:,]?\s*/gi, "")
        .replace(/\bjob\s+\d+\b/gi, "this listing")
        .trim();
}

function hasLargeExperienceGap(job: JobInput, resume: ParsedResumeData): boolean {
    if (resume.years_of_experience > 1) return false;

    const title = job.title.toLowerCase();
    const description = (job.description || "").toLowerCase();
    const seniorTitle = /\b(senior|sr\.?|staff|principal|lead|architect|manager|director)\b/.test(title);
    const requiredYears = [...description.matchAll(/\b(\d+)\+?\s*(?:years|yrs)\b/g)]
        .map((match) => Number(match[1]))
        .filter(Number.isFinite);

    return seniorTitle || requiredYears.some((years) => years >= 4);
}

function normalizeMatchResult(result: Partial<MatchResult>, job: JobInput, resume: ParsedResumeData): MatchResult {
    let score = Math.max(0, Math.min(100, Math.round(result.score ?? 50)));
    let reasoning = sanitizeReasoning(result.reasoning);

    if (hasLargeExperienceGap(job, resume) && score > LARGE_EXPERIENCE_GAP_SCORE_CAP) {
        score = LARGE_EXPERIENCE_GAP_SCORE_CAP;
        reasoning = `Very large experience mismatch: ${reasoning}`;
    }

    return { score, reasoning };
}

/**
 * Score a single job listing against resume data.
 * Used when there's only 1 job to score (not worth batching).
 */
export async function scoreJobMatch(
    job: JobInput,
    resume: ParsedResumeData,
    targetSeniority: string = "any",
    logger?: PipelineLogger
): Promise<MatchResult> {
    const prompt = SINGLE_MATCH_PROMPT
        .replace("{titles}", resume.job_titles.join(", "))
        .replace("{skills}", resume.skills.join(", "))
        .replace("{experience}", String(resume.years_of_experience))
        .replace("{industries}", resume.industries.join(", "))
        .replace("{seniority}", SENIORITY_LABELS[targetSeniority] || "Any level")
        .replace("{jobTitle}", job.title)
        .replace("{company}", job.company)
        .replace("{description}", (job.description || "No description available").substring(0, 2000));

    try {
        const { text, model } = await generateWithFallback(prompt, 15000);
        logger?.info("scoring", `Scored with model: ${model}`);
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned) as MatchResult;

        return normalizeMatchResult(parsed, job, resume);
    } catch (error) {
        console.error("Match scoring error:", error);
        return {
            score: 50,
            reasoning: "Could not generate match score \u2014 defaulted to 50.",
        };
    }
}

/**
 * Score a batch of job listings in a single Gemini API call.
 * Sends up to BATCH_SIZE jobs per call to minimize RPD usage.
 */
async function scoreBatchSingle(
    jobs: JobInput[],
    resume: ParsedResumeData,
    targetSeniority: string,
    logger?: PipelineLogger
): Promise<MatchResult[]> {
    // Build the job listings section
    const jobListingsText = jobs
        .map((job, i) => {
            const desc = (job.description || "No description available").substring(0, 1500);
            return `--- Job ${i + 1} ---\nTitle: ${job.title}\nCompany: ${job.company}\nDescription: ${desc}`;
        })
        .join("\n\n");

    const prompt = BATCH_MATCH_PROMPT
        .replace("{titles}", resume.job_titles.join(", "))
        .replace("{skills}", resume.skills.join(", "))
        .replace("{experience}", String(resume.years_of_experience))
        .replace("{industries}", resume.industries.join(", "))
        .replace("{seniority}", SENIORITY_LABELS[targetSeniority] || "Any level")
        .replace("{jobListings}", jobListingsText);

    try {
        const { text, model } = await generateWithFallback(prompt, 60000);
        logger?.info("scoring", `Batch used model: ${model}`);
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned) as MatchResult[];

        if (!Array.isArray(parsed) || parsed.length !== jobs.length) {
            const msg = `Expected ${jobs.length} results, got ${Array.isArray(parsed) ? parsed.length : 'non-array'}`;
            if (logger) {
                logger.error("scoring", msg);
            } else {
                console.error(`[batch-score] ${msg}`);
            }
            // Fall back to defaults for any missing entries
            return jobs.map((job, i) => normalizeMatchResult(Array.isArray(parsed) ? parsed[i] || {} : {}, job, resume));
        }

        return parsed.map((r, i) => normalizeMatchResult(r, jobs[i], resume));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (logger) {
            logger.error("scoring", `Batch scoring failed: ${msg}`);
        } else {
            console.error("[batch-score] Batch scoring error:", error);
        }
        return jobs.map(() => ({
            score: 50,
            reasoning: "Could not generate match score \u2014 defaulted to 50.",
        }));
    }
}

/**
 * Score multiple jobs against resume data using batched Gemini calls.
 * Splits jobs into chunks of BATCH_SIZE and scores each chunk in one API call.
 *
 * API impact: With BATCH_SIZE=5, scoring 30 jobs uses 6 API calls instead of 30.
 */
export async function scoreJobBatch(
    jobs: JobInput[],
    resume: ParsedResumeData,
    targetSeniority: string = "any",
    logger?: PipelineLogger
): Promise<MatchResult[]> {
    if (jobs.length === 0) return [];

    // Single job doesn't need batching
    if (jobs.length === 1) {
        const result = await scoreJobMatch(jobs[0], resume, targetSeniority, logger);
        return [result];
    }

    const allResults: MatchResult[] = [];

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
        const chunk = jobs.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(jobs.length / BATCH_SIZE);
        if (logger) {
            logger.info("scoring", `Batch ${batchNum}/${totalBatches}: scoring ${chunk.length} jobs`);
        } else {
            console.log(`[batch-score] Scoring batch ${batchNum}/${totalBatches} (${chunk.length} jobs)`);
        }

        const results = await scoreBatchSingle(chunk, resume, targetSeniority, logger);
        allResults.push(...results);

        // Small delay between batches to respect RPM limits
        if (i + BATCH_SIZE < jobs.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }

    return allResults;
}
