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

        const jobs = data.jobs_results || [];
        allJobs.push(...jobs);

        // Stop if no more pages
        nextPageToken = data.serpapi_pagination?.next_page_token;
        if (uds && nextPageToken) {
            logger?.warn("serpapi", `Skipping pagination for listing age filtered query "${searchQuery}" because SerpAPI may drop the uds filter when next_page_token is used`);
            break;
        }
        if (!nextPageToken || jobs.length === 0) break;
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
        posted_at: null, // SerpAPI gives relative times like "3 days ago", not ISO dates
        is_remote: detectRemote(job),
        salary_info: job.detected_extensions?.salary || null,
    };
}
