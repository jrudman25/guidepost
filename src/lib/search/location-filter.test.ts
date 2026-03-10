import { describe, it, expect } from "vitest";
import { detectRemote, isLocationCompatible } from "./location-filter";
import type { SerpApiJob } from "./serpapi";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<SerpApiJob> = {}): SerpApiJob {
    return {
        title: "Software Engineer",
        company_name: "Acme Corp",
        location: "Seattle, WA",
        description: "Join our engineering team.",
        detected_extensions: {},
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// detectRemote
// ---------------------------------------------------------------------------

describe("detectRemote", () => {
    it("returns true when SerpAPI sets work_from_home", () => {
        const job = makeJob({ detected_extensions: { work_from_home: true } });
        expect(detectRemote(job)).toBe(true);
    });

    it("returns true when title contains 'remote'", () => {
        const job = makeJob({ title: "Remote Software Engineer" });
        expect(detectRemote(job)).toBe(true);
    });

    it("returns true when description contains 'work from home'", () => {
        const job = makeJob({ description: "This is a work from home position." });
        expect(detectRemote(job)).toBe(true);
    });

    it("returns true for 'fully remote' in description", () => {
        const job = makeJob({ description: "This is a fully remote role." });
        expect(detectRemote(job)).toBe(true);
    });

    it("returns true for 'wfh' in description", () => {
        const job = makeJob({ description: "Position offers WFH flexibility." });
        expect(detectRemote(job)).toBe(true);
    });

    it("returns true for 'distributed' in description", () => {
        const job = makeJob({ description: "We are a distributed team across the US." });
        expect(detectRemote(job)).toBe(true);
    });

    it("returns false when no remote indicators", () => {
        const job = makeJob({
            title: "Software Engineer",
            description: "Join our team in the Seattle office.",
        });
        expect(detectRemote(job)).toBe(false);
    });

    it("handles case insensitivity", () => {
        const job = makeJob({ title: "REMOTE Software Engineer" });
        expect(detectRemote(job)).toBe(true);
    });

    it("handles null description", () => {
        const job = makeJob({ description: undefined as unknown as string });
        expect(detectRemote(job)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// isLocationCompatible
// ---------------------------------------------------------------------------

describe("isLocationCompatible", () => {
    it("always passes if user has no location filter", () => {
        const job = makeJob({ location: "New York, NY" });
        expect(isLocationCompatible(job, null, "any")).toBe(true);
    });

    it("always passes if user preference is remote", () => {
        const job = makeJob({ location: "New York, NY" });
        expect(isLocationCompatible(job, "Seattle, WA", "remote")).toBe(true);
    });

    it("always passes if job is remote (SerpAPI flag)", () => {
        const job = makeJob({
            location: "New York, NY",
            detected_extensions: { work_from_home: true },
        });
        expect(isLocationCompatible(job, "Seattle, WA", "any")).toBe(true);
    });

    it("always passes if job is remote (keyword detection)", () => {
        const job = makeJob({
            location: "New York, NY",
            title: "Remote Software Engineer",
        });
        expect(isLocationCompatible(job, "Seattle, WA", "any")).toBe(true);
    });

    it("passes when job location matches user city", () => {
        const job = makeJob({ location: "Seattle, WA" });
        expect(isLocationCompatible(job, "Seattle, WA", "any")).toBe(true);
    });

    it("passes when job location matches user state abbreviation", () => {
        const job = makeJob({ location: "Tacoma, WA" });
        expect(isLocationCompatible(job, "Seattle, WA", "any")).toBe(true);
    });

    it("passes when job location matches user state full name", () => {
        const job = makeJob({ location: "Tacoma, Washington" });
        expect(isLocationCompatible(job, "Seattle, WA", "any")).toBe(true);
    });

    it("rejects non-remote job from different state", () => {
        const job = makeJob({ location: "New York, NY" });
        expect(isLocationCompatible(job, "Seattle, WA", "any")).toBe(false);
    });

    it("rejects non-remote job from different city same state not matching", () => {
        const job = makeJob({ location: "Miami, FL" });
        expect(isLocationCompatible(job, "Seattle, WA", "any")).toBe(false);
    });

    it("passes when job has no location info (benefit of the doubt)", () => {
        const job = makeJob({ location: "" });
        expect(isLocationCompatible(job, "Seattle, WA", "any")).toBe(true);
    });

    it("handles hybrid preference — still filters by location", () => {
        const job = makeJob({ location: "Chicago, IL" });
        expect(isLocationCompatible(job, "Seattle, WA", "hybrid")).toBe(false);
    });

    it("handles onsite preference — still filters by location", () => {
        const job = makeJob({ location: "Portland, OR" });
        expect(isLocationCompatible(job, "Seattle, WA", "onsite")).toBe(false);
    });

    it("matches state abbreviation in job location against full state from user", () => {
        const job = makeJob({ location: "Bellevue, WA" });
        expect(isLocationCompatible(job, "Seattle, WA", "any")).toBe(true);
    });
});
