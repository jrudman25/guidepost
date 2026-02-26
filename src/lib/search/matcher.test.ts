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
        vi.useFakeTimers();
    });

    it("scores all jobs in order", async () => {
        let callCount = 0;
        mockGenerateContent.mockImplementation(() => {
            callCount++;
            return Promise.resolve({
                response: {
                    text: () =>
                        JSON.stringify({
                            score: callCount * 10,
                            reasoning: `Job ${callCount}`,
                        }),
                },
            });
        });

        const jobs = [
            { title: "A", company: "X", description: "desc" },
            { title: "B", company: "Y", description: "desc" },
        ];

        const batchPromise = scoreJobBatch(jobs, makeResume());

        // Advance through the 200ms delays between jobs
        await vi.advanceTimersByTimeAsync(500);

        const results = await batchPromise;
        expect(results).toHaveLength(2);
        expect(results[0].score).toBe(10);
        expect(results[1].score).toBe(20);
    });
});
