import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ParsedResumeData } from "@/lib/types";
import type { PipelineLogger } from "@/lib/pipeline-logger";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
- If the candidate targets "senior" roles and the job is clearly entry/junior level, reduce the score.
- If the target seniority is "any", treat experience level as a minor factor.

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
- If the candidate targets "senior" roles and the job is clearly entry/junior level, reduce the score.
- If the target seniority is "any", treat experience level as a minor factor.

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

type JobInput = { title: string; company: string; description: string | null };

/**
 * Score a single job listing against resume data.
 * Used when there's only 1 job to score (not worth batching).
 */
export async function scoreJobMatch(
    job: JobInput,
    resume: ParsedResumeData,
    targetSeniority: string = "any"
): Promise<MatchResult> {
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash" });

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
        const timeoutPromise = new Promise<{ response: { text: () => string } }>((_, reject) =>
            setTimeout(() => reject(new Error("Gemini AI API timeout after 15 seconds")), 15000)
        );

        const result = await Promise.race([
            model.generateContent(prompt),
            timeoutPromise
        ]);

        const text = result.response.text();
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned) as MatchResult;

        return {
            score: Math.max(0, Math.min(100, Math.round(parsed.score))),
            reasoning: parsed.reasoning,
        };
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
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash" });

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
        const timeoutPromise = new Promise<{ response: { text: () => string } }>((_, reject) =>
            setTimeout(() => reject(new Error("Gemini AI API timeout after 30 seconds")), 30000)
        );

        const result = await Promise.race([
            model.generateContent(prompt),
            timeoutPromise
        ]);

        const text = result.response.text();
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned) as MatchResult[];

        if (!Array.isArray(parsed) || parsed.length !== jobs.length) {
            const msg = `Expected ${jobs.length} results, got ${Array.isArray(parsed) ? parsed.length : 'non-array'}`;
            logger?.error("scoring", msg) ?? console.error(`[batch-score] ${msg}`);
            // Fall back to defaults for any missing entries
            return jobs.map((_, i) => ({
                score: Math.max(0, Math.min(100, Math.round(parsed[i]?.score ?? 50))),
                reasoning: parsed[i]?.reasoning || "Could not generate match score \u2014 defaulted to 50.",
            }));
        }

        return parsed.map((r) => ({
            score: Math.max(0, Math.min(100, Math.round(r.score))),
            reasoning: r.reasoning,
        }));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger?.error("scoring", `Batch scoring failed: ${msg}`) ?? console.error("[batch-score] Batch scoring error:", error);
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
        const result = await scoreJobMatch(jobs[0], resume, targetSeniority);
        return [result];
    }

    const allResults: MatchResult[] = [];

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
        const chunk = jobs.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(jobs.length / BATCH_SIZE);
        logger?.info("scoring", `Batch ${batchNum}/${totalBatches}: scoring ${chunk.length} jobs`) ??
            console.log(`[batch-score] Scoring batch ${batchNum}/${totalBatches} (${chunk.length} jobs)`);

        const results = await scoreBatchSingle(chunk, resume, targetSeniority, logger);
        allResults.push(...results);

        // Small delay between batches to respect RPM limits
        if (i + BATCH_SIZE < jobs.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }

    return allResults;
}
