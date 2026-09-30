import { createClient } from "@/lib/supabase/server";
import { buildSearchQueries } from "@/lib/search/query-builder";
import { searchJobs, normalizeJob } from "@/lib/search/serpapi";
import type { SerpApiJob } from "@/lib/search/serpapi";
import { isLocationCompatible } from "@/lib/search/location-filter";
import { isExcludedCompany } from "@/lib/search/company-filter";
import { scoreJobBatch } from "@/lib/search/matcher";
import { buildJobDedupKey } from "@/lib/search/job-dedup";
import { MAX_SERPAPI_CALLS_PER_RUN, MAX_PAGES_PER_QUERY, allocateQueryBudget, dayIndex } from "@/lib/search/query-budget";
import { PipelineLogger } from "@/lib/pipeline-logger";
import type { ParsedResumeData, SearchFilter } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const LOW_MATCH_SCORE_THRESHOLD = 50;
const AUTO_DISCARD_SCORE_THRESHOLD = 25;

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
    externalClient?: SupabaseClient,
    excludeUserId?: string,
    externalLogger?: PipelineLogger
): Promise<{ new_jobs_found: number; resumes_searched: number; logger: PipelineLogger }> {
    const supabase = externalClient || await createClient();
    const logger = externalLogger || new PipelineLogger();
    const shouldCheckpoint = Boolean(externalClient && externalLogger);
    const persistCheckpoint = async () => {
        if (shouldCheckpoint) {
            await logger.persist(supabase);
        }
    };

    // Get resumes to search for
    let query = supabase
        .from("resumes")
        .select("*")
        .eq("is_active", true)
        .not("parsed_data", "is", null);

    if (resumeId) {
        query = query.eq("id", resumeId);
    }

    // Exclude specific user (e.g., demo account) from cron searches
    if (excludeUserId) {
        query = query.neq("user_id", excludeUserId);
    }

    const { data: resumes, error: resumeError } = await query
        .order("user_id")
        .order("uploaded_at")
        .order("id");

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
    let serpApiCallsUsed = 0;
    const rotation = dayIndex();

    // Search filters are per user (shared across their resumes), so cache
    // them to query once per user instead of once per resume.
    const filtersByUser = new Map<string, SearchFilter>();

    // Pre-pass: load filters and build queries for every resume so the
    // SerpAPI budget can be divided fairly across users before any calls run.
    const prepared: Array<{
        resume: (typeof resumes)[number];
        parsed: ParsedResumeData;
        searchFilters: SearchFilter;
        queries: string[];
    }> = [];

    for (const resume of resumes) {
        const parsed = resume.parsed_data as ParsedResumeData;

        let searchFilters = filtersByUser.get(resume.user_id);
        if (!searchFilters) {
            // Explicit user_id filter: this also runs under the service-role
            // client in cron, which bypasses RLS.
            const { data: filters } = await supabase
                .from("search_filters")
                .select("*")
                .eq("user_id", resume.user_id)
                .maybeSingle();

            searchFilters = (filters as SearchFilter | null) || {
                id: "",
                user_id: resume.user_id,
                keywords: [],
                location: null,
                remote_preference: "any",
                target_seniority: "any",
                min_salary: null,
                max_listing_age_days: 7,
                excluded_companies: [],
            };
            filtersByUser.set(resume.user_id, searchFilters);
        }

        // Build search queries (rotation picks which titles are searched today)
        const queries = buildSearchQueries(parsed, searchFilters, rotation);
        logger.info("queries", `Resume ${resume.id.substring(0, 8)}...: ${queries.length} queries built`);
        queries.forEach((q, i) => logger.info("queries", `  Query ${i + 1}: "${q}"`));

        prepared.push({ resume, parsed, searchFilters, queries });
    }

    // Split the run's SerpAPI call budget across resumes (rotates which user
    // goes first each day so the same user isn't always starved).
    const allocations = allocateQueryBudget(
        prepared.map((p) => ({
            id: p.resume.id,
            user_id: p.resume.user_id,
            queryCount: p.queries.length,
        })),
        MAX_SERPAPI_CALLS_PER_RUN,
        rotation
    );

    // Leftover budget buys extra pages: each allocated query already used 1
    // of MAX_PAGES_PER_QUERY pages, so it can absorb that many fewer calls.
    const page1Calls = [...allocations.values()].reduce((a, b) => a + b, 0);
    const leftover = MAX_SERPAPI_CALLS_PER_RUN - page1Calls;
    const extraPages = allocateQueryBudget(
        prepared.map((p) => ({
            id: p.resume.id,
            user_id: p.resume.user_id,
            queryCount: (allocations.get(p.resume.id) ?? 0) * (MAX_PAGES_PER_QUERY - 1),
        })),
        leftover,
        rotation
    );
    if (leftover > 0) {
        logger.info("serpapi", `Leftover SerpAPI budget: ${leftover} call(s) for page 2 of top queries`);
    }

    for (const { resume, parsed, searchFilters, queries } of prepared) {
        const queryAllocation = allocations.get(resume.id) ?? 0;

        // Collect all eligible candidates across all queries for this resume,
        // then batch-score them to minimize Gemini API calls.
        const candidates: NormalizedCandidate[] = [];
        const existingUrls = new Set<string>();
        const existingKeys = new Set<string>();
        let serpApiResults = 0;
        let skippedExcluded = 0;
        let skippedNoUrl = 0;
        let skippedDuplicate = 0;
        let skippedRepost = 0;
        let skippedRemote = 0;
        let skippedLocation = 0;

        // Per-page result handling, shared by page 1 and page 2: dedup
        // lookups, filtering, and candidate collection. Returns how many new
        // candidates the page added.
        const processJobs = async (jobs: SerpApiJob[]): Promise<number> => {
            serpApiResults += jobs.length;

            // Batch-check for duplicate URLs
            const allUrls = jobs
                .map((j) => normalizeJob(j, resume.id).url)
                .filter((u): u is string => u !== null);

            if (allUrls.length > 0) {
                const { data: existingJobs } = await supabase
                    .from("job_listings")
                    .select("url")
                    .eq("user_id", resume.user_id)
                    .in("url", allUrls);
                existingJobs?.forEach((j) => existingUrls.add(j.url));
            }

            // Batch-check for reposts: same job with a rotating URL
            // (same title/company/location already saved for this user)
            const uniqueCompanies = [...new Set(
                jobs.map((j) => j.company_name).filter(Boolean)
            )];

            if (uniqueCompanies.length > 0) {
                const { data: existingByCompany } = await supabase
                    .from("job_listings")
                    .select("title, company, location")
                    .eq("user_id", resume.user_id)
                    .in("company", uniqueCompanies);
                existingByCompany?.forEach((j) =>
                    existingKeys.add(buildJobDedupKey(j.title, j.company, j.location))
                );
            }

            let added = 0;
            for (const job of jobs) {
                // Skip excluded companies
                if (isExcludedCompany(job.company_name, searchFilters.excluded_companies)) {
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

                const dedupKey = buildJobDedupKey(
                    normalized.title,
                    normalized.company,
                    normalized.location
                );
                if (existingKeys.has(dedupKey)) {
                    skippedRepost++;
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

                // Filter by location compatibility (non-remote jobs from distant locations)
                if (!isLocationCompatible(job, searchFilters.location, searchFilters.remote_preference || "any")) {
                    skippedLocation++;
                    continue;
                }

                existingUrls.add(normalized.url);
                existingKeys.add(dedupKey);

                candidates.push({
                    normalized,
                    resumeUserId: resume.user_id,
                });
                added++;
            }
            return added;
        };

        const page1Queries: Array<{
            queryStr: string;
            nextPageToken?: string;
            newCandidates: number;
            index: number;
        }> = [];

        for (let i = 0; i < queries.length; i++) {
            const queryStr = queries[i];
            if (i >= queryAllocation) {
                logger.warn("serpapi", `Skipping query "${queryStr}" to stay within the ${MAX_SERPAPI_CALLS_PER_RUN}-call SerpAPI budget for this run`);
                continue;
            }
            // Each query costs exactly 1 SerpAPI call, counted even if it throws.
            serpApiCallsUsed++;

            try {
                const { jobs, nextPageToken } = await searchJobs(queryStr, searchFilters, logger);
                logger.info("serpapi", `Query "${queryStr}": ${jobs.length} results`);
                const newCandidates = await processJobs(jobs);
                page1Queries.push({ queryStr, nextPageToken, newCandidates, index: i });
            } catch (searchError) {
                const msg = searchError instanceof Error ? searchError.message : String(searchError);
                logger.error("serpapi", `Search error for query "${queryStr}": ${msg}`);
            } finally {
                await persistCheckpoint();
            }
        }

        // Spend this resume's share of the leftover budget on page 2 of the
        // queries that produced the most new candidates on page 1.
        const extraPageCount = extraPages.get(resume.id) ?? 0;
        const rankedForPage2 = page1Queries
            .filter((q) => q.nextPageToken)
            .sort((a, b) => b.newCandidates - a.newCandidates || a.index - b.index);

        for (const page1Query of rankedForPage2.slice(0, extraPageCount)) {
            const { queryStr, nextPageToken, newCandidates } = page1Query;
            logger.info("serpapi", `Fetching page 2 for "${queryStr}" (${newCandidates} new candidate(s) on page 1)`);
            // Each page costs exactly 1 SerpAPI call, counted even if it throws.
            serpApiCallsUsed++;

            try {
                const { jobs } = await searchJobs(queryStr, searchFilters, logger, nextPageToken);
                await processJobs(jobs);
                logger.info("serpapi", `Query "${queryStr}" page 2: ${jobs.length} results`);
            } catch (searchError) {
                const msg = searchError instanceof Error ? searchError.message : String(searchError);
                logger.error("serpapi", `Search error for query "${queryStr}" page 2: ${msg}`);
            } finally {
                await persistCheckpoint();
            }
        }

        // Log filtering summary
        logger.info("filtering", `SerpAPI returned ${serpApiResults} total results`);
        if (skippedDuplicate > 0) logger.info("filtering", `Skipped ${skippedDuplicate} duplicate URLs`);
        if (skippedRepost > 0) logger.info("filtering", `Skipped ${skippedRepost} reposts (same title/company/location)`);
        if (skippedExcluded > 0) logger.info("filtering", `Skipped ${skippedExcluded} excluded companies`);
        if (skippedNoUrl > 0) logger.warn("filtering", `Skipped ${skippedNoUrl} jobs with no URL`);
        if (skippedRemote > 0) logger.info("filtering", `Skipped ${skippedRemote} non-remote jobs (remote preference)`);
        if (skippedLocation > 0) logger.info("filtering", `Skipped ${skippedLocation} out-of-area jobs (location filter)`);
        logger.info("filtering", `${candidates.length} new candidates to score`);
        await persistCheckpoint();

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

        // Failed scorings are not saved so the jobs get rescored if they
        // appear again in a future search.
        const failedScores = matchResults.filter((r) => r.failed).length;
        if (failedScores > 0) {
            logger.warn("scoring", `${failedScores} job(s) failed scoring and were not saved; they will be rescored if they appear in a future search`);
        }

        // Log score distribution (successful results only)
        const scores = matchResults.filter((r) => !r.failed).map((r) => r.score);
        const avgScore = scores.length > 0
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : 0;
        const highMatches = scores.filter((s) => s >= 80).length;
        const lowScoreCount = scores.filter((s) => s < 40).length;
        logger.info("scoring", `Score distribution: avg=${avgScore}, high(80+)=${highMatches}, low(<40)=${lowScoreCount}`);
        await persistCheckpoint();

        // Insert scored jobs into the database
        let insertErrors = 0;
        let regularMatches = 0;
        let lowMatches = 0;
        let autoDiscarded = 0;
        for (let i = 0; i < candidates.length; i++) {
            const { normalized, resumeUserId } = candidates[i];
            const matchResult = matchResults[i];

            if (matchResult.failed) {
                continue;
            }

            const shouldAutoDiscard = matchResult.score < AUTO_DISCARD_SCORE_THRESHOLD;

            if (shouldAutoDiscard) {
                autoDiscarded++;
            } else if (matchResult.score < LOW_MATCH_SCORE_THRESHOLD) {
                lowMatches++;
            } else {
                regularMatches++;
            }

            const { error: insertError } = await supabase
                .from("job_listings")
                .insert({
                    ...normalized,
                    user_id: resumeUserId,
                    match_score: matchResult.score,
                    match_reasoning: matchResult.reasoning,
                    status: shouldAutoDiscard ? "dismissed" : "new",
                    seen_at: shouldAutoDiscard ? new Date().toISOString() : null,
                });

            if (!insertError) {
                if (!shouldAutoDiscard) {
                    totalNewJobs++;
                }
                if (shouldAutoDiscard) {
                    logger.info("insert", `Auto-dismissed "${normalized.title}" at ${normalized.company}: score ${matchResult.score} below ${AUTO_DISCARD_SCORE_THRESHOLD}`);
                }
            } else {
                insertErrors++;
                logger.error("insert", `Failed to insert "${normalized.title}": ${insertError.message}`);
            }
        }

        logger.info("insert", `Inserted ${totalNewJobs} new jobs (${insertErrors} errors)`);
        logger.info("insert", `Score buckets: ${regularMatches} regular matches (>=${LOW_MATCH_SCORE_THRESHOLD}), ${lowMatches} low matches (${AUTO_DISCARD_SCORE_THRESHOLD}-${LOW_MATCH_SCORE_THRESHOLD - 1}), ${autoDiscarded} auto-dismissed (<${AUTO_DISCARD_SCORE_THRESHOLD})`);
        await persistCheckpoint();
    }

    logger.info("summary", `Search complete: ${totalNewJobs} new jobs found across ${resumes.length} resume(s); SerpAPI calls used: ${serpApiCallsUsed}/${MAX_SERPAPI_CALLS_PER_RUN}`);
    await persistCheckpoint();

    return {
        new_jobs_found: totalNewJobs,
        resumes_searched: resumes.length,
        logger,
    };
}
