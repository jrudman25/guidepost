import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ParsedResumeData } from "@/lib/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface MatchResult {
    score: number;
    reasoning: string;
}

const MATCH_PROMPT = `You are a job matching expert. Score how well a job listing matches a candidate's resume.

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

/**
 * Score a single job listing against resume data.
 */
export async function scoreJobMatch(
    job: { title: string; company: string; description: string | null },
    resume: ParsedResumeData,
    targetSeniority: string = "any"
): Promise<MatchResult> {
    const seniorityLabels: Record<string, string> = {
        entry: "Entry Level / Junior",
        mid: "Mid Level",
        senior: "Senior",
        any: "Any level",
    };
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = MATCH_PROMPT
        .replace("{titles}", resume.job_titles.join(", "))
        .replace("{skills}", resume.skills.join(", "))
        .replace("{experience}", String(resume.years_of_experience))
        .replace("{industries}", resume.industries.join(", "))
        .replace("{seniority}", seniorityLabels[targetSeniority] || "Any level")
        .replace("{jobTitle}", job.title)
        .replace("{company}", job.company)
        .replace("{description}", (job.description || "No description available").substring(0, 2000));

    try {
        const result = await model.generateContent(prompt);
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
            reasoning: "Could not generate match score — defaulted to 50.",
        };
    }
}

/**
 * Score a batch of jobs against resume data.
 * Processes sequentially to respect rate limits.
 */
export async function scoreJobBatch(
    jobs: Array<{ title: string; company: string; description: string | null }>,
    resume: ParsedResumeData,
    targetSeniority: string = "any"
): Promise<MatchResult[]> {
    const results: MatchResult[] = [];

    for (const job of jobs) {
        const result = await scoreJobMatch(job, resume, targetSeniority);
        results.push(result);
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return results;
}
