import { buildSerpApiParams } from "./query-builder";
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
}

/**
 * Search for jobs using SerpAPI's Google Jobs engine.
 */
export async function searchJobs(
    query: string,
    filters: SearchFilter
): Promise<SerpApiJob[]> {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
        throw new Error("SERPAPI_API_KEY is not configured");
    }

    const params = buildSerpApiParams(query, filters);
    params.api_key = apiKey;

    const url = new URL("https://serpapi.com/search.json");
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    const response = await fetch(url.toString());

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SerpAPI request failed: ${response.status} - ${errorText}`);
    }

    const data: SerpApiResponse = await response.json();

    if (data.error) {
        throw new Error(`SerpAPI error: ${data.error}`);
    }

    return data.jobs_results || [];
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
        is_remote: job.detected_extensions?.work_from_home || false,
        salary_info: job.detected_extensions?.salary || null,
    };
}
