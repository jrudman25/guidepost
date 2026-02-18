import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeJob, type SerpApiJob } from "./serpapi";

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

    it("always sets posted_at to null (relative dates not parsed)", () => {
        const result = normalizeJob(makeJob(), "r1");
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
                resume_id: "r1",
                keywords: [],
                location: null,
                remote_preference: "any",
                min_salary: null,
                max_listing_age_days: 7,
                excluded_companies: [],
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
            resume_id: "r1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
        });

        expect(result).toEqual(mockJobs);
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
            resume_id: "r1",
            keywords: [],
            location: null,
            remote_preference: "any",
            min_salary: null,
            max_listing_age_days: 7,
            excluded_companies: [],
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
                resume_id: "r1",
                keywords: [],
                location: null,
                remote_preference: "any",
                min_salary: null,
                max_listing_age_days: 7,
                excluded_companies: [],
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
                resume_id: "r1",
                keywords: [],
                location: null,
                remote_preference: "any",
                min_salary: null,
                max_listing_age_days: 7,
                excluded_companies: [],
            })
        ).rejects.toThrow("SerpAPI error: Invalid key");
    });
});
