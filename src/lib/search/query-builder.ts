import type { ParsedResumeData, SearchFilter } from "@/lib/types";

/**
 * Builds optimized search queries from resume data and filters.
 * Strategy: combine top job titles with location/remote filters
 * to maximize coverage with minimal API calls.
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
        // Fallback: use skills as search terms
        const topSkills = parsed.skills.slice(0, 3).join(" ");
        queries.push(topSkills);
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

    let result = seniorityStr
        ? queries.map((q) => `${q} ${seniorityStr}`)
        : queries;

    // Append filter keywords to each query if present
    if (filters.keywords && filters.keywords.length > 0) {
        const keywordStr = filters.keywords.slice(0, 3).join(" ");
        result = result.map((q) => `${q} ${keywordStr}`);
    }

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
    };

    // Location filter
    if (filters.location) {
        params.location = filters.location;
    }

    // Listing age filter (maps to chips parameter)
    if (filters.max_listing_age_days) {
        // SerpAPI Google Jobs date filter chip values
        const ageMap: Record<number, string> = {
            1: "date_posted:today",
            3: "date_posted:3days",
            7: "date_posted:week",
            14: "date_posted:month",
            30: "date_posted:month",
        };

        // Find the closest matching age filter
        const ages = Object.keys(ageMap).map(Number).sort((a, b) => a - b);
        const closest = ages.find((a) => a >= filters.max_listing_age_days) || ages[ages.length - 1];
        params.chips = ageMap[closest];
    }

    return params;
}
