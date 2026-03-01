import { createClient } from "@/lib/supabase/server";
import { buildSearchQueries } from "@/lib/search/query-builder";
import { searchJobs, normalizeJob } from "@/lib/search/serpapi";
import { scoreJobBatch } from "@/lib/search/matcher";
import { PipelineLogger } from "@/lib/pipeline-logger";
import type { ParsedResumeData, SearchFilter } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

interface NormalizedCandidate {
    normalized: ReturnType<typeof normalizeJob>;
    resumeUserId: string;
}

/**
 * Core search logic extracted so it can be called from both
 * the API route and the cron endpoint.
 *
 * Returns the search results and the pipeline logger for persistence.
 */
export async function executeJobSearch(
    resumeId?: string,
    externalClient?: SupabaseClient
): Promise<{ new_jobs_found: number; resumes_searched: number; logger: PipelineLogger }> {
    const supabase = externalClient || await createClient();
    const logger = new PipelineLogger();

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
        logger.error("setup", `Failed to fetch resumes: ${resumeError.message}`);
        throw new Error(resumeError.message);
    }

    if (!resumes || resumes.length === 0) {
        logger.info("setup", "No active resumes with parsed data found");
        return { new_jobs_found: 0, resumes_searched: 0, logger };
    }

    logger.info("setup", `Found ${resumes.length} active resume(s) to search`);

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
        logger.info("queries", `Resume ${resume.id.substring(0, 8)}...: ${queries.length} queries built`);
        queries.forEach((q, i) => logger.info("queries", `  Query ${i + 1}: "${q}"`));

        // Collect all eligible candidates across all queries for this resume,
        // then batch-score them to minimize Gemini API calls.
        const candidates: NormalizedCandidate[] = [];
        const existingUrls = new Set<string>();
        let serpApiResults = 0;
        let skippedExcluded = 0;
        let skippedNoUrl = 0;
        let skippedDuplicate = 0;
        let skippedRemote = 0;

        for (const queryStr of queries) {
            try {
                const jobs = await searchJobs(queryStr, searchFilters);
                serpApiResults += jobs.length;
                logger.info("serpapi", `Query "${queryStr}": ${jobs.length} results`);

                // Batch-check for duplicate URLs
                const allUrls = jobs
                    .map((j) => normalizeJob(j, resume.id).url)
                    .filter((u): u is string => u !== null);

                if (allUrls.length > 0) {
                    const { data: existingJobs } = await supabase
                        .from("job_listings")
                        .select("url")
                        .in("url", allUrls);
                    existingJobs?.forEach((j) => existingUrls.add(j.url));
                }

                for (const job of jobs) {
                    // Skip excluded companies
                    if (
                        searchFilters.excluded_companies?.some(
                            (exc) =>
                                job.company_name.toLowerCase().includes(exc.toLowerCase())
                        )
                    ) {
                        skippedExcluded++;
                        continue;
                    }

                    const normalized = normalizeJob(job, resume.id);

                    if (!normalized.url) {
                        skippedNoUrl++;
                        continue;
                    }

                    if (existingUrls.has(normalized.url)) {
                        skippedDuplicate++;
                        continue;
                    }

                    // Filter by remote preference (before scoring to save API calls)
                    if (
                        searchFilters.remote_preference === "remote" &&
                        !normalized.is_remote
                    ) {
                        skippedRemote++;
                        continue;
                    }

                    existingUrls.add(normalized.url);

                    candidates.push({
                        normalized,
                        resumeUserId: resume.user_id,
                    });
                }
            } catch (searchError) {
                const msg = searchError instanceof Error ? searchError.message : String(searchError);
                logger.error("serpapi", `Search error for query "${queryStr}": ${msg}`);
            }
        }

        // Log filtering summary
        logger.info("filtering", `SerpAPI returned ${serpApiResults} total results`);
        if (skippedDuplicate > 0) logger.info("filtering", `Skipped ${skippedDuplicate} duplicate URLs`);
        if (skippedExcluded > 0) logger.info("filtering", `Skipped ${skippedExcluded} excluded companies`);
        if (skippedNoUrl > 0) logger.warn("filtering", `Skipped ${skippedNoUrl} jobs with no URL`);
        if (skippedRemote > 0) logger.info("filtering", `Skipped ${skippedRemote} non-remote jobs (remote preference)`);
        logger.info("filtering", `${candidates.length} new candidates to score`);

        if (candidates.length === 0) {
            continue;
        }

        // Batch-score all candidates (5 per Gemini call)
        const jobInputs = candidates.map((c) => ({
            title: c.normalized.title,
            company: c.normalized.company,
            description: c.normalized.description,
        }));

        const batchCount = Math.ceil(candidates.length / 5);
        logger.info("scoring", `Scoring ${candidates.length} candidates in ${batchCount} Gemini batch(es)`);

        const matchResults = await scoreJobBatch(
            jobInputs,
            parsed,
            searchFilters.target_seniority || "any",
            logger
        );

        // Log score distribution
        const scores = matchResults.map((r) => r.score);
        const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const highMatches = scores.filter((s) => s >= 80).length;
        const lowMatches = scores.filter((s) => s < 40).length;
        logger.info("scoring", `Score distribution: avg=${avgScore}, high(80+)=${highMatches}, low(<40)=${lowMatches}`);

        // Insert scored jobs into the database
        let insertErrors = 0;
        for (let i = 0; i < candidates.length; i++) {
            const { normalized, resumeUserId } = candidates[i];
            const matchResult = matchResults[i];

            const { error: insertError } = await supabase
                .from("job_listings")
                .insert({
                    ...normalized,
                    user_id: resumeUserId,
                    match_score: matchResult.score,
                    match_reasoning: matchResult.reasoning,
                    status: "new",
                });

            if (!insertError) {
                totalNewJobs++;
            } else {
                insertErrors++;
                logger.error("insert", `Failed to insert "${normalized.title}": ${insertError.message}`);
            }
        }

        logger.info("insert", `Inserted ${totalNewJobs} new jobs (${insertErrors} errors)`);
    }

    logger.info("summary", `Search complete: ${totalNewJobs} new jobs found across ${resumes.length} resume(s)`);

    return {
        new_jobs_found: totalNewJobs,
        resumes_searched: resumes.length,
        logger,
    };
}
