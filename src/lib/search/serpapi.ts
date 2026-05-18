import { buildSerpApiParams } from "./query-builder";
import { detectRemote } from "./location-filter";
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
    job_id?: string;
    share_link?: string;
    apply_options?: Array<{
        title: string;
        link: string;
    }>;
}

interface SerpApiResponse {
    jobs_results?: SerpApiJob[];
    error?: string;
    filters?: SerpApiFilter[];
    serpapi_pagination?: {
        next_page_token?: string;
        next?: string;
    };
}

interface SerpApiFilter {
    name: string;
    options?: SerpApiFilterOption[];
}

interface SerpApiFilterOption {
    name: string;
    q?: string;
    uds?: string;
}

/**
 * Search for jobs using SerpAPI's Google Jobs engine.
 * Fetches up to MAX_PAGES pages (10 results each) to get more results.
 */
const MAX_PAGES = 5;
const LISTING_AGE_OPTIONS = [
    { maxDays: 1, name: "Yesterday" },
    { maxDays: 3, name: "Last 3 days" },
    { maxDays: 7, name: "Last week" },
    { maxDays: 30, name: "Last month" },
];

export async function searchJobs(
    query: string,
    filters: SearchFilter,
    logger?: PipelineLogger
): Promise<SerpApiJob[]> {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
        throw new Error("SERPAPI_API_KEY is not configured");
    }

    const allJobs: SerpApiJob[] = [];
    let nextPageToken: string | undefined;
    let searchQuery = query;
    let uds: string | undefined;
    let prefetchedFirstPage: SerpApiResponse | undefined;

    if (filters.max_listing_age_days > 0) {
        const discoveryParams = buildSerpApiParams(query, filters);
        discoveryParams.api_key = apiKey;
        const discoveryData = await fetchSerpApi(discoveryParams);

        if (handleSerpApiError(discoveryData, query, 0, logger)) {
            return [];
        }

        const listingAgeFilter = findListingAgeFilter(discoveryData, filters.max_listing_age_days);

        if (listingAgeFilter?.q && listingAgeFilter.uds) {
            searchQuery = listingAgeFilter.q;
            uds = listingAgeFilter.uds;
            logger?.info("serpapi", `Applying listing age filter "${listingAgeFilter.name}" for "${query}"`);
        } else {
            prefetchedFirstPage = discoveryData;
            logger?.warn("serpapi", `SerpAPI did not return a Date posted filter for "${query}"; continuing without listing age filtering`);
        }
    }

    for (let page = 0; page < MAX_PAGES; page++) {
        const params = buildSerpApiParams(searchQuery, filters);
        params.api_key = apiKey;

        if (uds) {
            params.uds = uds;
        }

        if (nextPageToken) {
            params.next_page_token = nextPageToken;
        }

        const data = page === 0 && prefetchedFirstPage
            ? prefetchedFirstPage
            : await fetchSerpApi(params);

        if (handleSerpApiError(data, searchQuery, page, logger)) {
            break;
        }

        const rawJobs = data.jobs_results || [];
        const jobs = filterJobsByListingAge(
            rawJobs,
            filters.max_listing_age_days,
            logger,
            searchQuery
        );
        allJobs.push(...jobs);

        // Stop if no more pages
        nextPageToken = data.serpapi_pagination?.next_page_token;
        if (!nextPageToken || rawJobs.length === 0) break;
    }

    return allJobs;
}

async function fetchSerpApi(params: Record<string, string>): Promise<SerpApiResponse> {
    const url = new URL("https://serpapi.com/search.json");
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    const response = await fetch(url.toString());

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

function findListingAgeFilter(
    data: SerpApiResponse,
    maxListingAgeDays: number
): SerpApiFilterOption | null {
    const target = LISTING_AGE_OPTIONS.find((option) => option.maxDays >= maxListingAgeDays)
        || LISTING_AGE_OPTIONS[LISTING_AGE_OPTIONS.length - 1];
    const datePostedFilter = data.filters?.find(
        (filter) => filter.name.toLowerCase() === "date posted"
    );

    return datePostedFilter?.options?.find((option) => option.name === target.name) || null;
}

function filterJobsByListingAge(
    jobs: SerpApiJob[],
    maxListingAgeDays: number,
    logger: PipelineLogger | undefined,
    query: string
): SerpApiJob[] {
    if (maxListingAgeDays <= 0) return jobs;

    const filtered = jobs.filter((job) => {
        const postedAt = parseSerpApiPostedAt(job.detected_extensions?.posted_at);
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

function parseSerpApiPostedAt(postedAt: string | undefined): Date | null {
    if (!postedAt) return null;

    const normalized = postedAt.trim().toLowerCase();
    const now = Date.now();

    if (
        normalized === "today" ||
        normalized === "just posted" ||
        normalized === "recently" ||
        normalized === "new"
    ) {
        return new Date(now);
    }

    if (normalized === "yesterday") {
        return new Date(now - 24 * 60 * 60 * 1000);
    }

    const match = normalized.match(/^(\d+|\ba\b|an)\+?\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months)\s+ago$/);
    if (!match) return null;

    const amount = match[1] === "a" || match[1] === "an"
        ? 1
        : Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
        minute: 60 * 1000,
        minutes: 60 * 1000,
        hour: 60 * 60 * 1000,
        hours: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        weeks: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        months: 30 * 24 * 60 * 60 * 1000,
    };

    return new Date(now - amount * multipliers[unit]);
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

    return {
        resume_id: resumeId,
        title: job.title,
        company: job.company_name,
        location: job.location || null,
        description: job.description || null,
        url: applyLink,
        source: "google_jobs",
        posted_at: parseSerpApiPostedAt(job.detected_extensions?.posted_at)?.toISOString() || null,
        is_remote: detectRemote(job),
        salary_info: job.detected_extensions?.salary || null,
    };
}
