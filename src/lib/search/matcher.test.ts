import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the Google Generative AI module before importing matcher
// ---------------------------------------------------------------------------

const mockGenerateContent = vi.fn();

vi.mock("@google/generative-ai", () => {
    return {
        GoogleGenerativeAI: class {
            getGenerativeModel() {
                return { generateContent: mockGenerateContent };
            }
        },
    };
});

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
        years_of_experience: 5,
        education: ["B.S. Computer Science"],
        certifications: [],
        industries: ["Technology"],
        ...overrides,
    };
}

const sampleJob = {
    title: "Senior Engineer",
    company: "Acme Corp",
    description: "Build web apps with React and TypeScript",
};

// ---------------------------------------------------------------------------
// scoreJobMatch
// ---------------------------------------------------------------------------

describe("scoreJobMatch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns parsed score and reasoning from Gemini", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({ score: 85, reasoning: "Strong skill match." }),
            },
        });

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(85);
        expect(result.reasoning).toBe("Strong skill match.");
    });

    it("clamps score to 0-100 range", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({ score: 150, reasoning: "Very high." }),
            },
        });

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(100);
    });

    it("clamps negative scores to 0", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({ score: -10, reasoning: "No match." }),
            },
        });

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(0);
    });

    it("rounds fractional scores", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({ score: 72.7, reasoning: "Good fit." }),
            },
        });

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(73);
    });

    it("strips markdown code blocks from Gemini response", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    '```json\n{"score": 60, "reasoning": "Decent match."}\n```',
            },
        });

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(60);
        expect(result.reasoning).toBe("Decent match.");
    });

    it("returns default score of 50 on Gemini failure", async () => {
        mockGenerateContent.mockRejectedValue(new Error("API quota exceeded"));

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(50);
        expect(result.reasoning).toContain("defaulted to 50");
    });

    it("returns default score of 50 on 15s timeout", async () => {
        // Mock a slow API response that takes 20 seconds
        mockGenerateContent.mockImplementation(() =>
            new Promise((resolve) => setTimeout(() => resolve({
                response: { text: () => JSON.stringify({ score: 99, reasoning: "Too slow." }) }
            }), 20000))
        );

        // Fast-forward fake timers immediately so test doesn't hang
        vi.useFakeTimers();
        const scorePromise = scoreJobMatch(sampleJob, makeResume());
        await vi.advanceTimersByTimeAsync(16000);

        const result = await scorePromise;
        expect(result.score).toBe(50);
        expect(result.reasoning).toContain("defaulted to 50");
        vi.useRealTimers();
    });

    it("returns default score on malformed JSON", async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => "not valid json at all" },
        });

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(50);
    });

    it("truncates very long descriptions to 2000 chars", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({ score: 70, reasoning: "OK match." }),
            },
        });

        const longDesc = "x".repeat(5000);
        await scoreJobMatch(
            { ...sampleJob, description: longDesc },
            makeResume()
        );

        const promptArg = mockGenerateContent.mock.calls[0][0] as string;
        expect(promptArg.length).toBeLessThan(5000);
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
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it("uses single-job scoring for 1 job", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({ score: 85, reasoning: "Great fit." }),
            },
        });

        const results = await scoreJobBatch([sampleJob], makeResume());
        expect(results).toHaveLength(1);
        expect(results[0].score).toBe(85);
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it("scores multiple jobs in a single batch API call", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify([
                        { score: 90, reasoning: "Excellent match." },
                        { score: 60, reasoning: "Partial match." },
                    ]),
            },
        });

        const jobs = [
            { title: "A", company: "X", description: "desc" },
            { title: "B", company: "Y", description: "desc" },
        ];

        const results = await scoreJobBatch(jobs, makeResume());
        expect(results).toHaveLength(2);
        expect(results[0].score).toBe(90);
        expect(results[1].score).toBe(60);
        // Only 1 API call for 2 jobs (batched)
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it("returns fallback scores on batch failure", async () => {
        mockGenerateContent.mockRejectedValue(new Error("API error"));

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

