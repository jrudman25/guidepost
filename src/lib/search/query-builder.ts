import type { ParsedResumeData, SearchFilter } from "@/lib/types";

/**
 * Builds optimized search queries from resume data and filters.
 * Strategy: keep queries simple — just job title + seniority level.
 * Google Jobs returns better results with focused queries.
 * Skill matching is handled post-search by the AI matcher.
 * 
 * Target: ~4 queries per resume to stay within SerpAPI free tier.
 */
export function buildSearchQueries(
    parsed: ParsedResumeData,
    filters: SearchFilter
): string[] {
    const queries: string[] = [];

    // Get unique job titles (max 4 queries)
    const titles = parsed.job_titles.slice(0, 4);

    if (titles.length === 0) {
        // Fallback: use top skills as individual queries
        const topSkills = parsed.skills.slice(0, 3);
        for (const skill of topSkills) {
            queries.push(`${skill} jobs`);
        }
        if (queries.length === 0) {
            queries.push("software developer"); // ultimate fallback
        }
    } else {
        for (const title of titles) {
            queries.push(title);
        }
    }

    // Append seniority level qualifier
    const seniorityMap: Record<string, string> = {
        entry: "entry level OR junior",
        mid: "mid level",
        senior: "senior",
    };
    const seniorityStr = filters.target_seniority && filters.target_seniority !== "any"
        ? seniorityMap[filters.target_seniority]
        : null;

    const result = seniorityStr
        ? queries.map((q) => `${q} ${seniorityStr}`)
        : queries;

    return result;
}

/**
 * Build the SerpAPI params for a Google Jobs search.
 */
export function buildSerpApiParams(
    query: string,
    filters: SearchFilter
): Record<string, string> {
    const params: Record<string, string> = {
        engine: "google_jobs",
        q: query,
        hl: "en",   // Force English results
        gl: "us",   // US-centric results
    };

    // Location filter
    if (filters.location) {
        params.location = filters.location;
    }

    return params;
}
