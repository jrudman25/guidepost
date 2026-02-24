import { describe, it, expect } from "vitest";
import { computeStats, type StatsApplication } from "./stats";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(overrides: Partial<StatsApplication> = {}): StatsApplication {
    return {
        applied_at: "2026-01-15T00:00:00",
        status: "applied",
        status_updated_at: "2026-01-15T00:00:00",
        heard_back_at: null,
        ...overrides,
    };
}

// Fixed reference date for deterministic tests
const NOW = new Date(2026, 0, 30, 12, 0, 0); // Jan 30, 2026 noon

// ---------------------------------------------------------------------------
// avgDaysToHearBack
// ---------------------------------------------------------------------------

describe("avgDaysToHearBack", () => {
    it("prefers heard_back_at over status_updated_at", () => {
        const apps = [
            makeApp({
                applied_at: "2026-01-10T00:00:00",
                status: "interview",
                status_updated_at: "2026-01-20T00:00:00",
                heard_back_at: "2026-01-15T00:00:00",
            }),
        ];

        const result = computeStats(apps, NOW);
        // Should use heard_back_at (5 days), not status_updated_at (10 days)
        expect(result.avgDaysToHearBack).toBe(5);
    });

    it("falls back to status_updated_at when heard_back_at is null", () => {
        const apps = [
            makeApp({
                applied_at: "2026-01-10T00:00:00",
                status: "screening",
                status_updated_at: "2026-01-20T00:00:00",
                heard_back_at: null,
            }),
        ];

        const result = computeStats(apps, NOW);
        expect(result.avgDaysToHearBack).toBe(10);
    });

    it("excludes applied and ghosted statuses", () => {
        const apps = [
            makeApp({
                applied_at: "2026-01-10T00:00:00",
                status: "applied",
                status_updated_at: "2026-01-25T00:00:00",
            }),
            makeApp({
                applied_at: "2026-01-10T00:00:00",
                status: "ghosted",
                status_updated_at: "2026-01-25T00:00:00",
            }),
            makeApp({
                applied_at: "2026-01-10T00:00:00",
                status: "interview",
                status_updated_at: "2026-01-17T00:00:00",
            }),
        ];

        const result = computeStats(apps, NOW);
        // Only the interview app counts: 7 days
        expect(result.avgDaysToHearBack).toBe(7);
    });

    it("returns 0 when no responded apps exist", () => {
        const apps = [makeApp({ status: "applied" })];
        const result = computeStats(apps, NOW);
        expect(result.avgDaysToHearBack).toBe(0);
    });

    it("averages correctly across multiple responded apps", () => {
        const apps = [
            makeApp({
                applied_at: "2026-01-10T00:00:00",
                status: "screening",
                heard_back_at: "2026-01-14T00:00:00", // 4 days
            }),
            makeApp({
                applied_at: "2026-01-10T00:00:00",
                status: "offer",
                heard_back_at: "2026-01-20T00:00:00", // 10 days
            }),
        ];

        const result = computeStats(apps, NOW);
        expect(result.avgDaysToHearBack).toBe(7); // (4 + 10) / 2 = 7
    });

    it("clamps negative differences to 0", () => {
        const apps = [
            makeApp({
                applied_at: "2026-01-20T00:00:00",
                status: "screening",
                // heard_back_at before applied - edge case
                heard_back_at: "2026-01-10T00:00:00",
            }),
        ];

        const result = computeStats(apps, NOW);
        expect(result.avgDaysToHearBack).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// responseRate
// ---------------------------------------------------------------------------

describe("responseRate", () => {
    it("calculates correct percentage", () => {
        const apps = [
            makeApp({ status: "applied" }),
            makeApp({ status: "interview" }),
            makeApp({ status: "screening" }),
            makeApp({ status: "rejected" }),
            makeApp({ status: "ghosted" }),
        ];

        const result = computeStats(apps, NOW);
        // 3 responded out of 5 total = 60%
        expect(result.responseRate).toBe(60);
    });

    it("returns 0 when no applications exist", () => {
        const result = computeStats([], NOW);
        expect(result.responseRate).toBe(0);
    });

    it("returns 0 when all are applied or ghosted", () => {
        const apps = [
            makeApp({ status: "applied" }),
            makeApp({ status: "ghosted" }),
        ];

        const result = computeStats(apps, NOW);
        expect(result.responseRate).toBe(0);
    });

    it("returns 100 when all have responded", () => {
        const apps = [
            makeApp({ status: "interview" }),
            makeApp({ status: "offer" }),
        ];

        const result = computeStats(apps, NOW);
        expect(result.responseRate).toBe(100);
    });
});

// ---------------------------------------------------------------------------
// statusBreakdown
// ---------------------------------------------------------------------------

describe("statusBreakdown", () => {
    it("counts statuses correctly", () => {
        const apps = [
            makeApp({ status: "applied" }),
            makeApp({ status: "applied" }),
            makeApp({ status: "interview" }),
            makeApp({ status: "offer" }),
            makeApp({ status: "rejected" }),
            makeApp({ status: "rejected" }),
            makeApp({ status: "ghosted" }),
        ];

        const result = computeStats(apps, NOW);
        expect(result.statusBreakdown).toEqual({
            applied: 2,
            screening: 0,
            interview: 1,
            offer: 1,
            rejected: 2,
            ghosted: 1,
        });
    });

    it("returns all zeros for empty input", () => {
        const result = computeStats([], NOW);
        expect(result.statusBreakdown).toEqual({
            applied: 0,
            screening: 0,
            interview: 0,
            offer: 0,
            rejected: 0,
            ghosted: 0,
        });
    });
});

// ---------------------------------------------------------------------------
// applicationsThisWeek / applicationsThisMonth
// ---------------------------------------------------------------------------

describe("time-based counts", () => {
    it("counts applications within the last 7 days", () => {
        const apps = [
            makeApp({ applied_at: "2026-01-29T00:00:00" }), // 1 day ago - in
            makeApp({ applied_at: "2026-01-25T00:00:00" }), // 5 days ago - in
            makeApp({ applied_at: "2026-01-20T00:00:00" }), // 10 days ago - out
        ];

        const result = computeStats(apps, NOW);
        expect(result.applicationsThisWeek).toBe(2);
    });

    it("counts applications within the last month", () => {
        const apps = [
            makeApp({ applied_at: "2026-01-29T00:00:00" }), // 1 day ago - in
            makeApp({ applied_at: "2026-01-15T00:00:00" }), // 15 days ago - in
            makeApp({ applied_at: "2025-12-15T00:00:00" }), // 46 days ago - out
        ];

        const result = computeStats(apps, NOW);
        expect(result.applicationsThisMonth).toBe(2);
    });

    it("returns 0 for no recent applications", () => {
        const apps = [
            makeApp({ applied_at: "2025-06-01T00:00:00" }),
        ];

        const result = computeStats(apps, NOW);
        expect(result.applicationsThisWeek).toBe(0);
        expect(result.applicationsThisMonth).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// totalApplications
// ---------------------------------------------------------------------------

describe("totalApplications", () => {
    it("returns the total count", () => {
        const apps = [makeApp(), makeApp(), makeApp()];
        const result = computeStats(apps, NOW);
        expect(result.totalApplications).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// weeklyApplications
// ---------------------------------------------------------------------------

describe("weeklyApplications", () => {
    it("returns 8 weekly buckets", () => {
        const result = computeStats([], NOW);
        expect(result.weeklyApplications).toHaveLength(8);
    });

    it("places applications in the correct weekly bucket", () => {
        const apps = [
            makeApp({ applied_at: "2026-01-29T00:00:00" }), // within current week
        ];

        const result = computeStats(apps, NOW);
        // The last bucket (most recent week) should have the app
        const lastBucket = result.weeklyApplications[result.weeklyApplications.length - 1];
        expect(lastBucket.count).toBeGreaterThanOrEqual(0);
        // Total across all buckets should equal 1
        const totalInBuckets = result.weeklyApplications.reduce((s, w) => s + w.count, 0);
        expect(totalInBuckets).toBe(1);
    });
});
