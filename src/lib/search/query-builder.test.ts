import { describe, it, expect } from "vitest";
import { buildSearchQueries, buildSerpApiParams } from "./query-builder";
import type { ParsedResumeData, SearchFilter } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResume(overrides: Partial<ParsedResumeData> = {}): ParsedResumeData {
    return {
        summary: "Experienced software engineer",
        job_titles: ["Software Engineer", "Full-Stack Developer"],
        skills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
        years_of_experience: 5,
        education: ["B.S. Computer Science"],
        certifications: [],
        industries: ["Technology"],
        ...overrides,
    };
}

function makeFilters(overrides: Partial<SearchFilter> = {}): SearchFilter {
    return {
        id: "f1",
        resume_id: "r1",
        keywords: [],
        location: null,
        remote_preference: "any",
        min_salary: null,
        max_listing_age_days: 7,
        excluded_companies: [],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// buildSearchQueries
// ---------------------------------------------------------------------------

describe("buildSearchQueries", () => {
    it("creates one query per job title (up to 4)", () => {
        const resume = makeResume({
            job_titles: ["Engineer", "Developer", "Architect"],
        });
        const result = buildSearchQueries(resume, makeFilters());
        expect(result).toEqual(["Engineer", "Developer", "Architect"]);
    });

    it("caps queries at 4 titles", () => {
        const resume = makeResume({
            job_titles: ["A", "B", "C", "D", "E", "F"],
        });
        const result = buildSearchQueries(resume, makeFilters());
        expect(result).toHaveLength(4);
    });

    it("falls back to skills when no job titles exist", () => {
        const resume = makeResume({
            job_titles: [],
            skills: ["React", "Node", "SQL", "Docker"],
        });
        const result = buildSearchQueries(resume, makeFilters());
        expect(result).toHaveLength(1);
        expect(result[0]).toBe("React Node SQL");
    });

    it("appends filter keywords to each query", () => {
        const resume = makeResume({ job_titles: ["Engineer"] });
        const filters = makeFilters({ keywords: ["remote", "startup"] });
        const result = buildSearchQueries(resume, filters);
        expect(result).toEqual(["Engineer remote startup"]);
    });

    it("limits appended keywords to 3", () => {
        const resume = makeResume({ job_titles: ["Engineer"] });
        const filters = makeFilters({
            keywords: ["a", "b", "c", "d", "e"],
        });
        const result = buildSearchQueries(resume, filters);
        expect(result[0]).toBe("Engineer a b c");
    });

    it("returns empty-skills fallback when both titles and skills are empty", () => {
        const resume = makeResume({ job_titles: [], skills: [] });
        const result = buildSearchQueries(resume, makeFilters());
        // Should return a single query with empty string (join of empty array)
        expect(result).toHaveLength(1);
        expect(result[0]).toBe("");
    });
});

// ---------------------------------------------------------------------------
// buildSerpApiParams
// ---------------------------------------------------------------------------

describe("buildSerpApiParams", () => {
    it("sets the engine and query", () => {
        const params = buildSerpApiParams("Software Engineer", makeFilters());
        expect(params.engine).toBe("google_jobs");
        expect(params.q).toBe("Software Engineer");
    });

    it("includes location when set", () => {
        const filters = makeFilters({ location: "San Francisco, CA" });
        const params = buildSerpApiParams("Engineer", filters);
        expect(params.location).toBe("San Francisco, CA");
    });

    it("omits location when null", () => {
        const params = buildSerpApiParams("Engineer", makeFilters());
        expect(params).not.toHaveProperty("location");
    });

    it("sets date_posted chip for 1-day listing age", () => {
        const filters = makeFilters({ max_listing_age_days: 1 });
        const params = buildSerpApiParams("Engineer", filters);
        expect(params.chips).toBe("date_posted:today");
    });

    it("sets date_posted chip for 7-day listing age", () => {
        const filters = makeFilters({ max_listing_age_days: 7 });
        const params = buildSerpApiParams("Engineer", filters);
        expect(params.chips).toBe("date_posted:week");
    });

    it("maps intermediate ages to the closest larger bucket", () => {
        const filters = makeFilters({ max_listing_age_days: 5 });
        const params = buildSerpApiParams("Engineer", filters);
        expect(params.chips).toBe("date_posted:week");
    });

    it("maps large ages to the month bucket", () => {
        const filters = makeFilters({ max_listing_age_days: 20 });
        const params = buildSerpApiParams("Engineer", filters);
        expect(params.chips).toBe("date_posted:month");
    });
});
