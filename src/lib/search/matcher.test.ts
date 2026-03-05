import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the shared Gemini helper before importing matcher
// ---------------------------------------------------------------------------

const mockGenerate = vi.fn();

vi.mock("@/lib/gemini", () => ({
    generateWithFallback: (...args: unknown[]) => mockGenerate(...args),
}));

import { scoreJobMatch, scoreJobBatch } from "./matcher";
import type { ParsedResumeData } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResume(overrides: Partial<ParsedResumeData> = {}): ParsedResumeData {
    return {
        summary: "Experienced developer",
        job_titles: ["Software Engineer"],
        skills: ["TypeScript", "React"],
        years_of_experience: 3,
        education: ["BS Computer Science"],
        certifications: [],
        industries: ["Technology"],
        ...overrides,
    };
}

const sampleJob = {
    title: "Frontend Developer",
    company: "Acme Corp",
    description: "Build React apps with TypeScript. 2+ years experience required.",
};

// ---------------------------------------------------------------------------
// scoreJobMatch
// ---------------------------------------------------------------------------

describe("scoreJobMatch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("parses a valid Gemini response", async () => {
        mockGenerate.mockResolvedValue(
            JSON.stringify({ score: 85, reasoning: "Strong skill overlap." })
        );

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(85);
        expect(result.reasoning).toBe("Strong skill overlap.");
    });

    it("clamps scores above 100", async () => {
        mockGenerate.mockResolvedValue(
            JSON.stringify({ score: 150, reasoning: "Over the top." })
        );

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(100);
    });

    it("clamps scores below 0", async () => {
        mockGenerate.mockResolvedValue(
            JSON.stringify({ score: -10, reasoning: "No match." })
        );

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(0);
    });

    it("rounds fractional scores", async () => {
        mockGenerate.mockResolvedValue(
            JSON.stringify({ score: 72.7, reasoning: "Good fit." })
        );

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(73);
    });

    it("strips markdown code blocks from Gemini response", async () => {
        mockGenerate.mockResolvedValue(
            '```json\n{"score": 60, "reasoning": "Decent match."}\n```'
        );

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(60);
        expect(result.reasoning).toBe("Decent match.");
    });

    it("returns default score of 50 on Gemini failure", async () => {
        mockGenerate.mockRejectedValue(new Error("API quota exceeded"));

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(50);
        expect(result.reasoning).toContain("Could not generate");
    });

    it("passes seniority to prompt", async () => {
        mockGenerate.mockResolvedValue(
            JSON.stringify({ score: 40, reasoning: "Wrong level." })
        );

        await scoreJobMatch(sampleJob, makeResume(), "entry");
        const prompt = mockGenerate.mock.calls[0][0] as string;
        expect(prompt).toContain("Entry Level / Junior");
    });

    it("shows 'Any level' when seniority is 'any'", async () => {
        mockGenerate.mockResolvedValue(
            JSON.stringify({ score: 70, reasoning: "Any level." })
        );

        await scoreJobMatch(sampleJob, makeResume(), "any");
        const prompt = mockGenerate.mock.calls[0][0] as string;
        expect(prompt).toContain("Any level");
    });

    it("truncates long descriptions to 2000 chars", async () => {
        mockGenerate.mockResolvedValue(
            JSON.stringify({ score: 50, reasoning: "OK." })
        );

        const longJob = {
            ...sampleJob,
            description: "x".repeat(5000),
        };

        await scoreJobMatch(longJob, makeResume());
        const prompt = mockGenerate.mock.calls[0][0] as string;
        // The description in the prompt should be truncated
        const descStart = prompt.indexOf("x".repeat(100));
        const remaining = prompt.substring(descStart);
        // Should not contain the full 5000 chars
        expect(remaining.length).toBeLessThan(3000);
    });
});

// ---------------------------------------------------------------------------
// scoreJobBatch
// ---------------------------------------------------------------------------

describe("scoreJobBatch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns empty array for empty input", async () => {
        const results = await scoreJobBatch([], makeResume());
        expect(results).toHaveLength(0);
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("uses single-job scoring for 1 job", async () => {
        mockGenerate.mockResolvedValue(
            JSON.stringify({ score: 85, reasoning: "Great fit." })
        );

        const results = await scoreJobBatch([sampleJob], makeResume());
        expect(results).toHaveLength(1);
        expect(results[0].score).toBe(85);
        expect(mockGenerate).toHaveBeenCalledTimes(1);
    });

    it("scores multiple jobs in a single batch API call", async () => {
        mockGenerate.mockResolvedValue(
            JSON.stringify([
                { score: 90, reasoning: "Excellent match." },
                { score: 60, reasoning: "Partial match." },
            ])
        );

        const jobs = [
            { title: "A", company: "X", description: "desc" },
            { title: "B", company: "Y", description: "desc" },
        ];

        const results = await scoreJobBatch(jobs, makeResume());
        expect(results).toHaveLength(2);
        expect(results[0].score).toBe(90);
        expect(results[1].score).toBe(60);
        // Only 1 API call for 2 jobs (batched)
        expect(mockGenerate).toHaveBeenCalledTimes(1);
    });

    it("returns fallback scores on batch failure", async () => {
        mockGenerate.mockRejectedValue(new Error("API error"));

        const jobs = [
            { title: "A", company: "X", description: "desc" },
            { title: "B", company: "Y", description: "desc" },
        ];

        const results = await scoreJobBatch(jobs, makeResume());
        expect(results).toHaveLength(2);
        expect(results[0].score).toBe(50);
        expect(results[1].score).toBe(50);
    });
});

