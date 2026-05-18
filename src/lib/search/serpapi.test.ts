import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeJob, type SerpApiJob } from "./serpapi";
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
        expect(result.source).toBe("google_jobs");
        expect(result.is_remote).toBe(false);
        expect(result.salary_info).toBe("$120K - $150K");
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
                resume_id: "r1",
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
            resume_id: "r1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        });

        expect(result).toEqual(mockJobs);
    });

    it("applies listing age with the returned Date posted uds filter", async () => {
        const mockJobs = [makeJob()];
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    filters: [
                        {
                            name: "Date posted",
                            options: [
                                {
                                    name: "Last 3 days",
                                    q: "Engineer in the last 3 days",
                                    uds: "uds-3-days",
                                },
                                {
                                    name: "Last week",
                                    q: "Engineer in the last week",
                                    uds: "uds-last-week",
                                },
                            ],
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ jobs_results: mockJobs }),
            });
        vi.stubGlobal("fetch", fetchMock);

        const { searchJobs } = await import("./serpapi");
        const logger = {
            info: vi.fn(),
        } as unknown as PipelineLogger;
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            resume_id: "r1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        }, logger);

        const filteredUrl = new URL(fetchMock.mock.calls[1][0]);
        expect(result).toEqual(mockJobs);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(filteredUrl.searchParams.get("q")).toBe("Engineer in the last week");
        expect(filteredUrl.searchParams.get("uds")).toBe("uds-last-week");
        expect(filteredUrl.searchParams.get("chips")).toBeNull();
        expect(logger.info).toHaveBeenCalledWith(
            "serpapi",
            "Applying listing age filter \"Last week\" for \"Engineer\""
        );
    });

    it("paginates filtered searches and discards jobs older than listing age", async () => {
        const freshJob = makeJob({
            title: "Fresh Engineer",
            detected_extensions: { posted_at: "2 days ago" },
        });
        const oldJob = makeJob({
            title: "Old Engineer",
            detected_extensions: { posted_at: "14 days ago" },
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    filters: [
                        {
                            name: "Date posted",
                            options: [
                                {
                                    name: "Last week",
                                    q: "Engineer in the last week",
                                    uds: "uds-last-week",
                                },
                            ],
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    jobs_results: [freshJob],
                    serpapi_pagination: {
                        next_page_token: "next-page",
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ jobs_results: [oldJob] }),
            });
        vi.stubGlobal("fetch", fetchMock);

        const { searchJobs } = await import("./serpapi");
        const logger = {
            info: vi.fn(),
        } as unknown as PipelineLogger;
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            resume_id: "r1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        }, logger);

        const secondPageUrl = new URL(fetchMock.mock.calls[2][0]);
        expect(result).toEqual([freshJob]);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(secondPageUrl.searchParams.get("next_page_token")).toBe("next-page");
        expect(secondPageUrl.searchParams.get("uds")).toBe("uds-last-week");
        expect(logger.info).toHaveBeenCalledWith(
            "filtering",
            "Skipped 1 job(s) older than 7 day(s) for \"Engineer in the last week\""
        );
    });

    it("uses the discovery results when Date posted filter is unavailable", async () => {
        const mockJobs = [makeJob()];
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ jobs_results: mockJobs }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { searchJobs } = await import("./serpapi");
        const logger = {
            warn: vi.fn(),
        } as unknown as PipelineLogger;
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            resume_id: "r1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        }, logger);

        expect(result).toEqual(mockJobs);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(
            "serpapi",
            "SerpAPI did not return a Date posted filter for \"Engineer\"; continuing without listing age filtering"
        );
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
            resume_id: "r1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        });

        expect(result).toEqual([]);
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
                resume_id: "r1",
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
                resume_id: "r1",
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
            warn: vi.fn(),
        } as unknown as PipelineLogger;
        const result = await searchJobs("Engineer", {
            id: "f1",
            user_id: "u1",
            resume_id: "r1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
            target_seniority: "any",
        }, logger);

        expect(result).toEqual([]);
        expect(logger.warn).toHaveBeenCalledWith(
            "serpapi",
            "Google Jobs returned no results for \"Engineer\" on page 1: Google hasn't returned any results for this query."
        );
    });
});
