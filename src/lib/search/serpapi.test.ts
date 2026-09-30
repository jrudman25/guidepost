import { describe, it, expect, vi, beforeEach } from "vitest";
import { getListingAgePhrase, normalizeJob, type SerpApiJob } from "./serpapi";
import type { PipelineLogger } from "@/lib/pipeline-logger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<SerpApiJob> = {}): SerpApiJob {
    return {
        title: "Software Engineer",
        company_name: "Acme Corp",
        location: "San Francisco, CA",
        description: "Build cool stuff",
        detected_extensions: {
            posted_at: "3 days ago",
            salary: "$120K - $150K",
            work_from_home: false,
        },
        job_id: "abc123",
        share_link: "https://google.com/jobs/abc123",
        apply_options: [
            { title: "Company Site", link: "https://acme.com/apply" },
        ],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// normalizeJob
// ---------------------------------------------------------------------------

describe("normalizeJob", () => {
    it("maps all fields correctly", () => {
        const job = makeJob();
        const result = normalizeJob(job, "resume-1");

        expect(result.resume_id).toBe("resume-1");
        expect(result.title).toBe("Software Engineer");
        expect(result.company).toBe("Acme Corp");
        expect(result.location).toBe("San Francisco, CA");
        expect(result.description).toBe("Build cool stuff");
        expect(result.source).toBe("Company Site");
        expect(result.is_remote).toBe(false);
        expect(result.salary_info).toBe("$120K - $150K");
    });

    it("strips the 'via ' prefix from the via field for source", () => {
        const job = makeJob({ via: "via LinkedIn" });
        const result = normalizeJob(job, "r1");
        expect(result.source).toBe("LinkedIn");
    });

    it("uses the via field directly when it has no prefix", () => {
        const job = makeJob({ via: "Indeed" });
        const result = normalizeJob(job, "r1");
        expect(result.source).toBe("Indeed");
    });

    it("falls back to the first apply_options title when via is missing", () => {
        const job = makeJob({
            apply_options: [
                { title: "Company Site", link: "https://acme.com/apply" },
            ],
        });
        const result = normalizeJob(job, "r1");
        expect(result.source).toBe("Company Site");
    });

    it("defaults source to google_jobs when neither via nor apply_options exist", () => {
        const job = makeJob({ via: undefined, apply_options: undefined });
        const result = normalizeJob(job, "r1");
        expect(result.source).toBe("google_jobs");
    });

    it("prefers the first apply_options link as URL", () => {
        const job = makeJob({
            apply_options: [
                { title: "Apply", link: "https://acme.com/apply" },
                { title: "LinkedIn", link: "https://linkedin.com/apply" },
            ],
            share_link: "https://google.com/jobs/fallback",
        });
        const result = normalizeJob(job, "r1");
        expect(result.url).toBe("https://acme.com/apply");
    });

    it("falls back to share_link when no apply_options", () => {
        const job = makeJob({
            apply_options: undefined,
            share_link: "https://google.com/jobs/share",
        });
        const result = normalizeJob(job, "r1");
        expect(result.url).toBe("https://google.com/jobs/share");
    });

    it("returns null URL when no links exist", () => {
        const job = makeJob({
            apply_options: undefined,
            share_link: undefined,
        });
        const result = normalizeJob(job, "r1");
        expect(result.url).toBeNull();
    });

    it("detects remote jobs from work_from_home extension", () => {
        const job = makeJob({
            detected_extensions: { work_from_home: true },
        });
        const result = normalizeJob(job, "r1");
        expect(result.is_remote).toBe(true);
    });

    it("defaults is_remote to false when no extensions", () => {
        const job = makeJob({ detected_extensions: undefined });
        const result = normalizeJob(job, "r1");
        expect(result.is_remote).toBe(false);
    });

    it("returns null for location when empty", () => {
        const job = makeJob({ location: "" });
        const result = normalizeJob(job, "r1");
        expect(result.location).toBeNull();
    });

    it("returns null for salary when not in extensions", () => {
        const job = makeJob({ detected_extensions: {} });
        const result = normalizeJob(job, "r1");
        expect(result.salary_info).toBeNull();
    });

    it("parses relative posted_at values into ISO timestamps", () => {
        const result = normalizeJob(makeJob(), "r1");
        expect(result.posted_at).not.toBeNull();
        expect(Date.now() - new Date(result.posted_at!).getTime()).toBeGreaterThanOrEqual(3 * 24 * 60 * 60 * 1000 - 1000);
    });

    it("returns null posted_at when SerpAPI does not provide a parseable value", () => {
        const result = normalizeJob(makeJob({ detected_extensions: { posted_at: "Full-time" } }), "r1");
        expect(result.posted_at).toBeNull();
    });

    it("parses metadata from the extensions array when detected_extensions is absent", () => {
        const job = makeJob({
            detected_extensions: undefined,
            extensions: ["6 days ago", "80K\u201395K a year", "Work from home"],
        });
        const result = normalizeJob(job, "r1");

        expect(result.posted_at).not.toBeNull();
        const ageMs = Date.now() - new Date(result.posted_at!).getTime();
        expect(ageMs).toBeGreaterThanOrEqual(6 * 24 * 60 * 60 * 1000 - 1000);
        expect(ageMs).toBeLessThan(7 * 24 * 60 * 60 * 1000);
        expect(result.salary_info).toBe("80K\u201395K a year");
        expect(result.is_remote).toBe(true);
    });

    it("prefers detected_extensions over the extensions array", () => {
        const job = makeJob({
            detected_extensions: { posted_at: "1 day ago", salary: "$200K a year" },
            extensions: ["6 days ago", "80K\u201395K a year", "Work from home"],
        });
        const result = normalizeJob(job, "r1");

        const ageMs = Date.now() - new Date(result.posted_at!).getTime();
        expect(ageMs).toBeLessThan(2 * 24 * 60 * 60 * 1000);
        expect(result.salary_info).toBe("$200K a year");
        expect(result.is_remote).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// searchJobs (mocked fetch)
// ---------------------------------------------------------------------------

describe("searchJobs", () => {
    beforeEach(() => {
        vi.stubEnv("SERPAPI_API_KEY", "test-key");
        vi.restoreAllMocks();
    });

    it("throws when SERPAPI_API_KEY is missing", async () => {
        vi.stubEnv("SERPAPI_API_KEY", "");
        // Re-import to pick up new env
        const { searchJobs } = await import("./serpapi");
        await expect(
            searchJobs("Engineer", {
                id: "f1",
                user_id: "u1",
                keywords: [],
                location: null,
                remote_preference: "any",
                min_salary: null,
                max_listing_age_days: 7,
                excluded_companies: [],
                target_seniority: "any",
            })
        ).rejects.toThrow("SERPAPI_API_KEY is not configured");
    });

    it("returns jobs_results from API response", async () => {
        const mockJobs = [makeJob()];
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ jobs_results: mockJobs }),
            })
        );

        const { searchJobs } = await import("./serpapi");
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        });

        expect(result.jobs).toEqual(mockJobs);
    });

    it("appends the listing age phrase to the query and makes exactly one call", async () => {
        const mockJobs = [makeJob()];
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ jobs_results: mockJobs }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { searchJobs } = await import("./serpapi");
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        });

        expect(result.jobs).toEqual(mockJobs);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.searchParams.get("q")).toBe("Engineer in the last week");
        expect(url.searchParams.get("uds")).toBeNull();
        expect(url.searchParams.get("chips")).toBeNull();
    });

    it("searches the plain query when max_listing_age_days is 0", async () => {
        const mockJobs = [makeJob()];
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ jobs_results: mockJobs }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { searchJobs } = await import("./serpapi");
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 0,
            excluded_companies: [],
            target_seniority: "any",
        });

        expect(result.jobs).toEqual(mockJobs);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.searchParams.get("q")).toBe("Engineer");
    });

    it("uses the broadest phrase for ages over 30 days and still filters client-side", async () => {
        const oldJob = makeJob({
            title: "Old Job",
            detected_extensions: undefined,
            extensions: ["20 days ago", "Full-time"],
        });
        const freshJob = makeJob({
            title: "Fresh Job",
            detected_extensions: undefined,
            extensions: ["5 days ago", "Full-time"],
        });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ jobs_results: [oldJob, freshJob] }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { searchJobs } = await import("./serpapi");
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 14,
            excluded_companies: [],
            target_seniority: "any",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.searchParams.get("q")).toBe("Engineer in the last month");
        // The 20-day-old job is dropped by the client-side safety net
        expect(result.jobs).toEqual([freshJob]);
    });

    it("makes one call per invocation and returns the next page token", async () => {
        const freshJob = makeJob({
            title: "Fresh Engineer",
            detected_extensions: { posted_at: "2 days ago" },
        });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                jobs_results: [freshJob],
                serpapi_pagination: {
                    next_page_token: "next-page",
                },
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { searchJobs } = await import("./serpapi");
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        });

        expect(result.jobs).toEqual([freshJob]);
        expect(result.nextPageToken).toBe("next-page");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("passes the page token and keeps the listing age phrase on later pages", async () => {
        const page2Job = makeJob({ title: "Page 2 Engineer" });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ jobs_results: [page2Job] }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { searchJobs } = await import("./serpapi");
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        }, undefined, "next-page");

        expect(result.jobs).toEqual([page2Job]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.searchParams.get("next_page_token")).toBe("next-page");
        expect(url.searchParams.get("q")).toBe("Engineer in the last week");
    });

    it("returns no next page token when the page has no results", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                jobs_results: [],
                serpapi_pagination: {
                    next_page_token: "next-page",
                },
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { searchJobs } = await import("./serpapi");
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        });

        expect(result.jobs).toEqual([]);
        expect(result.nextPageToken).toBeUndefined();
    });

    it("returns empty array when no jobs_results", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            })
        );

        const { searchJobs } = await import("./serpapi");
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        });

        expect(result.jobs).toEqual([]);
    });

    it("throws on HTTP error", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 429,
                text: () => Promise.resolve("Rate limited"),
            })
        );

        const { searchJobs } = await import("./serpapi");
        await expect(
            searchJobs("Engineer", {
                id: "f1",
                user_id: "u1",
                keywords: [],
                location: null,
                remote_preference: "any",
                min_salary: null,
                max_listing_age_days: 7,
                excluded_companies: [],
                target_seniority: "any",
            })
        ).rejects.toThrow("SerpAPI request failed: 429");
    });

    it("throws on API error in response body", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ error: "Invalid key" }),
            })
        );

        const { searchJobs } = await import("./serpapi");
        await expect(
            searchJobs("Engineer", {
                id: "f1",
                user_id: "u1",
                keywords: [],
                location: null,
                remote_preference: "any",
                min_salary: null,
                max_listing_age_days: 7,
                excluded_companies: [],
                target_seniority: "any",
            })
        ).rejects.toThrow("SerpAPI error: Invalid key");
    });

    it("warns and returns empty array when Google hasn't returned any results", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    error: "Google hasn't returned any results for this query.",
                }),
            })
        );

        const { searchJobs } = await import("./serpapi");
        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
        } as unknown as PipelineLogger;
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        }, logger);

        expect(result.jobs).toEqual([]);
        expect(result.nextPageToken).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith(
            "serpapi",
            "Google Jobs returned no results for \"Engineer in the last week\" on page 1: Google hasn't returned any results for this query."
        );
    });

    it("reports page 2 in the warning when a page token was passed", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    error: "Google hasn't returned any results for this query.",
                }),
            })
        );

        const { searchJobs } = await import("./serpapi");
        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
        } as unknown as PipelineLogger;
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        }, logger, "next-page");

        expect(result.jobs).toEqual([]);
        expect(logger.warn).toHaveBeenCalledWith(
            "serpapi",
            "Google Jobs returned no results for \"Engineer in the last week\" on page 2: Google hasn't returned any results for this query."
        );
    });
});

// ---------------------------------------------------------------------------
// getListingAgePhrase
// ---------------------------------------------------------------------------

describe("getListingAgePhrase", () => {
    it.each([
        [1, "since yesterday"],
        [2, "in the last 3 days"],
        [3, "in the last 3 days"],
        [7, "in the last week"],
        [30, "in the last month"],
        [45, "in the last month"],
    ])("maps %i day(s) to %s", (days, phrase) => {
        expect(getListingAgePhrase(days)).toBe(phrase);
    });

    it("returns null when listing age filtering is disabled", () => {
        expect(getListingAgePhrase(0)).toBeNull();
        expect(getListingAgePhrase(-5)).toBeNull();
    });
});
