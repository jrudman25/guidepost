import { buildSerpApiParams } from "./query-builder";
import { detectRemote } from "./location-filter";
import { getJobExtensions, parseSerpApiPostedAt } from "./job-extensions";
import type { PipelineLogger } from "@/lib/pipeline-logger";
import type { SearchFilter } from "@/lib/types";

export interface SerpApiJob {
    title: string;
    company_name: string;
    location: string;
    description: string;
    detected_extensions?: {
        posted_at?: string;
        salary?: string;
        schedule_type?: string;
        work_from_home?: boolean;
    };
    extensions?: string[];
    job_id?: string;
    share_link?: string;
    via?: string;
    apply_options?: Array<{
        title: string;
        link: string;
    }>;
}

interface SerpApiResponse {
    jobs_results?: SerpApiJob[];
    error?: string;
    serpapi_pagination?: {
        next_page_token?: string;
        next?: string;
    };
}

/**
 * Search for jobs using SerpAPI's Google Jobs engine.
 * Fetches exactly one page per invocation (10 results); pass `pageToken`
 * for subsequent pages of the same query.
 *
 * Every invocation costs exactly 1 SerpAPI call. When a listing age filter
 * is set, the age phrase is appended to the query text (Google Jobs applies
 * the date filter from the phrase alone); the client-side filter remains as
 * a safety net for ages that fall between the available phrases.
 */
const LISTING_AGE_OPTIONS = [
    { maxDays: 1, phrase: "since yesterday" },
    { maxDays: 3, phrase: "in the last 3 days" },
    { maxDays: 7, phrase: "in the last week" },
    { maxDays: 30, phrase: "in the last month" },
];

export interface SerpApiSearchResult {
    jobs: SerpApiJob[];
    nextPageToken?: string;
}

/**
 * Map a max listing age in days to the smallest Google Jobs date phrase that
 * covers it (e.g. 14 days -> "in the last month"). Returns null when no
 * listing age filter is requested.
 */
export function getListingAgePhrase(maxDays: number): string | null {
    if (maxDays <= 0) return null;

    const option = LISTING_AGE_OPTIONS.find((o) => o.maxDays >= maxDays)
        || LISTING_AGE_OPTIONS[LISTING_AGE_OPTIONS.length - 1];
    return option.phrase;
}

export async function searchJobs(
    query: string,
    filters: SearchFilter,
    logger?: PipelineLogger,
    pageToken?: string
): Promise<SerpApiSearchResult> {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
        throw new Error("SERPAPI_API_KEY is not configured");
    }

    const listingAgePhrase = getListingAgePhrase(filters.max_listing_age_days);
    const searchQuery = listingAgePhrase ? `${query} ${listingAgePhrase}` : query;

    if (listingAgePhrase && !pageToken) {
        logger?.info("serpapi", `Applying listing age phrase "${listingAgePhrase}" for "${query}"`);
    }

    const params = buildSerpApiParams(searchQuery, filters);
    params.api_key = apiKey;

    if (pageToken) {
        params.next_page_token = pageToken;
    }

    const data = await fetchSerpApi(params);

    if (handleSerpApiError(data, searchQuery, pageToken ? 1 : 0, logger)) {
        return { jobs: [] };
    }

    const rawJobs = data.jobs_results || [];
    const jobs = filterJobsByListingAge(
        rawJobs,
        filters.max_listing_age_days,
        logger,
        searchQuery
    );

    // No point paginating an empty page
    const nextPageToken = rawJobs.length > 0
        ? data.serpapi_pagination?.next_page_token
        : undefined;

    return { jobs, nextPageToken };
}

async function fetchSerpApi(params: Record<string, string>): Promise<SerpApiResponse> {
    const url = new URL("https://serpapi.com/search.json");
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SerpAPI request failed: ${response.status} - ${errorText}`);
    }

    return response.json();
}

function handleSerpApiError(
    data: SerpApiResponse,
    query: string,
    page: number,
    logger?: PipelineLogger
): boolean {
    if (!data.error) return false;

    if (data.error.includes("Google hasn't returned any results")) {
        logger?.warn("serpapi", `Google Jobs returned no results for "${query}" on page ${page + 1}: ${data.error}`);
        return true;
    }

    throw new Error(`SerpAPI error: ${data.error}`);
}

function filterJobsByListingAge(
    jobs: SerpApiJob[],
    maxListingAgeDays: number,
    logger: PipelineLogger | undefined,
    query: string
): SerpApiJob[] {
    if (maxListingAgeDays <= 0) return jobs;

    const filtered = jobs.filter((job) => {
        const postedAt = parseSerpApiPostedAt(getJobExtensions(job).posted_at);
        if (!postedAt) return true;

        const ageMs = Date.now() - postedAt.getTime();
        const maxAgeMs = maxListingAgeDays * 24 * 60 * 60 * 1000;
        return ageMs <= maxAgeMs;
    });

    const skipped = jobs.length - filtered.length;
    if (skipped > 0) {
        logger?.info("filtering", `Skipped ${skipped} job(s) older than ${maxListingAgeDays} day(s) for "${query}"`);
    }

    return filtered;
}

function getJobSource(job: SerpApiJob): string {
    const via = job.via?.replace(/^via\s+/i, "").trim();
    return via || job.apply_options?.[0]?.title?.trim() || "google_jobs";
}

/**
 * Normalize a SerpAPI job result into our database format.
 */
export function normalizeJob(
    job: SerpApiJob,
    resumeId: string
): {
    resume_id: string;
    title: string;
    company: string;
    location: string | null;
    description: string | null;
    url: string | null;
    source: string;
    posted_at: string | null;
    is_remote: boolean;
    salary_info: string | null;
} {
    // Get the best apply link
    const applyLink = job.apply_options?.[0]?.link || job.share_link || null;
    const ext = getJobExtensions(job);

    return {
        resume_id: resumeId,
        title: job.title,
        company: job.company_name,
        location: job.location || null,
        description: job.description || null,
        url: applyLink,
        source: getJobSource(job),
        posted_at: parseSerpApiPostedAt(ext.posted_at)?.toISOString() || null,
        is_remote: detectRemote(job),
        salary_info: ext.salary || null,
    };
}
