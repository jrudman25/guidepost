import { createClient } from "@/lib/supabase/server";
import { buildSearchQueries } from "@/lib/search/query-builder";
import { searchJobs, normalizeJob } from "@/lib/search/serpapi";
import { scoreJobMatch } from "@/lib/search/matcher";
import type { ParsedResumeData, SearchFilter } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Core search logic extracted so it can be called from both
 * the API route and the cron endpoint.
 */
export async function executeJobSearch(resumeId?: string, externalClient?: SupabaseClient) {
    const supabase = externalClient || await createClient();

    // Get resumes to search for
    let query = supabase
        .from("resumes")
        .select("*")
        .eq("is_active", true)
        .not("parsed_data", "is", null);

    if (resumeId) {
        query = query.eq("id", resumeId);
    }

    const { data: resumes, error: resumeError } = await query;

    if (resumeError) {
        throw new Error(resumeError.message);
    }

    if (!resumes || resumes.length === 0) {
        return { new_jobs_found: 0, resumes_searched: 0 };
    }

    let totalNewJobs = 0;

    for (const resume of resumes) {
        const parsed = resume.parsed_data as ParsedResumeData;

        // Get search filters for this resume
        const { data: filters } = await supabase
            .from("search_filters")
            .select("*")
            .eq("resume_id", resume.id)
            .single();

        const searchFilters: SearchFilter = filters || {
            id: "",
            resume_id: resume.id,
            keywords: [],
            location: null,
            remote_preference: "any",
            target_seniority: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
        };

        // Build and execute search queries
        const queries = buildSearchQueries(parsed, searchFilters);
        console.log(`[search] Resume ${resume.id}: ${queries.length} queries`, queries);

        for (const queryStr of queries) {
            try {
                const jobs = await searchJobs(queryStr, searchFilters);
                console.log(`[search] Query "${queryStr}": ${jobs.length} results from SerpAPI`);

                for (const job of jobs) {
                    // Skip excluded companies
                    if (
                        searchFilters.excluded_companies?.some(
                            (exc) =>
                                job.company_name.toLowerCase().includes(exc.toLowerCase())
                        )
                    ) {
                        console.log(`[search] Skipped: excluded company "${job.company_name}"`);
                        continue;
                    }

                    // Normalize the job data
                    const normalized = normalizeJob(job, resume.id);

                    // Skip if no URL (can't deduplicate) or if URL already exists
                    if (!normalized.url) {
                        console.log(`[search] Skipped: no URL for "${normalized.title}"`);
                        continue;
                    }

                    // Check for duplicate
                    const { data: existing } = await supabase
                        .from("job_listings")
                        .select("id")
                        .eq("url", normalized.url)
                        .maybeSingle();

                    if (existing) {
                        console.log(`[search] Skipped: duplicate URL for "${normalized.title}"`);
                        continue;
                    }

                    // Score the match
                    const matchResult = await scoreJobMatch(
                        {
                            title: normalized.title,
                            company: normalized.company,
                            description: normalized.description,
                        },
                        parsed,
                        searchFilters.target_seniority || "any"
                    );

                    // Filter by remote preference
                    if (
                        searchFilters.remote_preference === "remote" &&
                        !normalized.is_remote
                    ) {
                        continue;
                    }

                    // Insert the job listing
                    const { error: insertError } = await supabase
                        .from("job_listings")
                        .insert({
                            ...normalized,
                            match_score: matchResult.score,
                            match_reasoning: matchResult.reasoning,
                            status: "new",
                        });

                    if (!insertError) {
                        totalNewJobs++;
                    }
                }
            } catch (searchError) {
                console.error(`Search error for query "${queryStr}":`, searchError);
                // Continue with other queries
            }
        }
    }

    return {
        new_jobs_found: totalNewJobs,
        resumes_searched: resumes.length,
    };
}
