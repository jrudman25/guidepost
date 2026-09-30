import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// scoreJobBatch waits 1s before its retry round; fake timers keep tests fast
async function scoreBatchFast(
    jobs: Parameters<typeof scoreJobBatch>[0],
    resume: ParsedResumeData
) {
    vi.useFakeTimers();
    const promise = scoreJobBatch(jobs, resume);
    await vi.advanceTimersByTimeAsync(10_000);
    return promise;
}

// ---------------------------------------------------------------------------
// scoreJobMatch
// ---------------------------------------------------------------------------

describe("scoreJobMatch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("parses a valid Gemini response", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: 85, reasoning: "Strong skill overlap." }), model: "test-model" }
        );

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(85);
        expect(result.reasoning).toBe("Strong skill overlap.");
    });

    it("clamps scores above 100", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: 150, reasoning: "Over the top." }), model: "test-model" }
        );

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(100);
    });

    it("caps clear senior role matches for candidates with 1 year of experience", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: 82, reasoning: "Strong technical overlap." }), model: "test-model" }
        );

        const seniorJob = {
            title: "Senior Frontend Developer",
            company: "Acme Corp",
            description: "Build React apps with TypeScript.",
        };

        const result = await scoreJobMatch(seniorJob, makeResume({ years_of_experience: 1 }));
        expect(result.score).toBe(24);
        expect(result.reasoning).toContain("Very large experience mismatch");
    });

    it("does not treat future start dates as an experience mismatch", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: 78, reasoning: "Good skills match for the role." }), model: "test-model" }
        );

        const startDateJob = {
            title: "Software Engineer, 2026 Start",
            company: "Acme Corp",
            description: "Build React apps with TypeScript.",
        };

        const result = await scoreJobMatch(startDateJob, makeResume({ years_of_experience: 1 }));
        expect(result.score).toBe(78);
    });

    it("clamps scores below 0", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: -10, reasoning: "No match." }), model: "test-model" }
        );

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(0);
    });

    it("rounds fractional scores", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: 72.7, reasoning: "Good fit." }), model: "test-model" }
        );

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(73);
    });

    it("strips markdown code blocks from Gemini response", async () => {
        mockGenerate.mockResolvedValue(
            { text: '```json\n{"score": 60, "reasoning": "Decent match."}\n```', model: "test-model" }
        );

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(60);
        expect(result.reasoning).toBe("Decent match.");
    });

    it("removes references to other batch listings from reasoning", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: 70, reasoning: "Just like Job 1, this role has solid React overlap." }), model: "test-model" }
        );

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.reasoning).toBe("this role has solid React overlap.");
        expect(result.reasoning).not.toContain("Job 1");
    });

    it("marks the result failed on Gemini failure", async () => {
        mockGenerate.mockRejectedValue(new Error("API quota exceeded"));

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(0);
        expect(result.failed).toBe(true);
        expect(result.reasoning).toBe("Could not generate match score.");
    });

    it("marks the result failed when the score is not a number", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: "high", reasoning: "Looks good." }), model: "test-model" }
        );

        const result = await scoreJobMatch(sampleJob, makeResume());
        expect(result.score).toBe(0);
        expect(result.failed).toBe(true);
    });

    it("passes seniority to prompt", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: 40, reasoning: "Wrong level." }), model: "test-model" }
        );

        await scoreJobMatch(sampleJob, makeResume(), "entry");
        const prompt = mockGenerate.mock.calls[0][0] as string;
        expect(prompt).toContain("Entry Level / Junior");
    });

    it("shows 'Any level' when seniority is 'any'", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: 70, reasoning: "Any level." }), model: "test-model" }
        );

        await scoreJobMatch(sampleJob, makeResume(), "any");
        const prompt = mockGenerate.mock.calls[0][0] as string;
        expect(prompt).toContain("Any level");
    });

    it("truncates long descriptions to 4000 chars", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: 50, reasoning: "OK." }), model: "test-model" }
        );

        const longJob = {
            ...sampleJob,
            description: "x".repeat(5000),
        };

        await scoreJobMatch(longJob, makeResume());
        const prompt = mockGenerate.mock.calls[0][0] as string;
        expect(prompt).toContain("x".repeat(4000));
        expect(prompt).not.toContain("x".repeat(4001));
    });

    it("requests JSON mode with an object schema", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: 80, reasoning: "Good." }), model: "test-model" }
        );

        await scoreJobMatch(sampleJob, makeResume());
        const options = mockGenerate.mock.calls[0][2] as { responseJsonSchema?: { type?: string } };
        expect(options.responseJsonSchema?.type).toBe("object");
    });
});

// ---------------------------------------------------------------------------
// scoreJobBatch
// ---------------------------------------------------------------------------

describe("scoreJobBatch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns empty array for empty input", async () => {
        const results = await scoreJobBatch([], makeResume());
        expect(results).toHaveLength(0);
        expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("uses single-job scoring for 1 job", async () => {
        mockGenerate.mockResolvedValue(
            { text: JSON.stringify({ score: 85, reasoning: "Great fit." }), model: "test-model" }
        );

        const results = await scoreJobBatch([sampleJob], makeResume());
        expect(results).toHaveLength(1);
        expect(results[0].score).toBe(85);
        expect(mockGenerate).toHaveBeenCalledTimes(1);
    });

    it("requests JSON mode with an array schema", async () => {
        mockGenerate.mockResolvedValue(
            {
                text: JSON.stringify([
                    { score: 90, reasoning: "Excellent match." },
                    { score: 60, reasoning: "Partial match." },
                ]), model: "test-model"
            }
        );

        const jobs = [
            { title: "A", company: "X", description: "desc" },
            { title: "B", company: "Y", description: "desc" },
        ];

        await scoreJobBatch(jobs, makeResume());
        const options = mockGenerate.mock.calls[0][2] as { responseJsonSchema?: { type?: string } };
        expect(options.responseJsonSchema?.type).toBe("array");
    });

    it("scores multiple jobs in a single batch API call", async () => {
        mockGenerate.mockResolvedValue(
            {
                text: JSON.stringify([
                    { score: 90, reasoning: "Excellent match." },
                    { score: 60, reasoning: "Partial match." },
                ]), model: "test-model"
            }
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

    it("marks all results failed when the batch fails twice (exactly one retry)", async () => {
        mockGenerate.mockRejectedValue(new Error("API error"));

        const jobs = [
            { title: "A", company: "X", description: "desc" },
            { title: "B", company: "Y", description: "desc" },
        ];

        const results = await scoreBatchFast(jobs, makeResume());
        expect(results).toHaveLength(2);
        expect(results[0].failed).toBe(true);
        expect(results[0].score).toBe(0);
        expect(results[1].failed).toBe(true);
        expect(results[1].score).toBe(0);
        // One initial batch call + one retry call
        expect(mockGenerate).toHaveBeenCalledTimes(2);
    });

    it("recovers failed results when the retry succeeds", async () => {
        mockGenerate
            .mockResolvedValueOnce({ text: "{ not valid json", model: "test-model" })
            .mockResolvedValueOnce({
                text: JSON.stringify([
                    { score: 81, reasoning: "Recovered." },
                    { score: 72, reasoning: "Recovered." },
                ]), model: "test-model"
            });

        const jobs = [
            { title: "A", company: "X", description: "desc" },
            { title: "B", company: "Y", description: "desc" },
        ];

        const results = await scoreBatchFast(jobs, makeResume());
        expect(results[0].score).toBe(81);
        expect(results[0].failed).toBeUndefined();
        expect(results[1].score).toBe(72);
        expect(results[1].failed).toBeUndefined();
        expect(mockGenerate).toHaveBeenCalledTimes(2);
    });

    it("retries only the missing batch entry via the single-job path", async () => {
        mockGenerate
            .mockResolvedValueOnce({
                text: JSON.stringify([
                    { score: 88, reasoning: "Strong match." },
                ]), model: "test-model"
            })
            .mockResolvedValueOnce({
                text: JSON.stringify({ score: 91, reasoning: "Recovered." }),
                model: "test-model",
            });

        const jobs = [
            { title: "A", company: "X", description: "desc" },
            { title: "B", company: "Y", description: "desc" },
        ];

        const results = await scoreBatchFast(jobs, makeResume());
        expect(results).toHaveLength(2);
        expect(results[0].score).toBe(88);
        expect(results[0].failed).toBeUndefined();
        expect(results[1].score).toBe(91);
        expect(results[1].failed).toBeUndefined();
        expect(mockGenerate).toHaveBeenCalledTimes(2);
        // The retry used the single-job path (object schema, not array)
        const retryOptions = mockGenerate.mock.calls[1][2] as { responseJsonSchema?: { type?: string } };
        expect(retryOptions.responseJsonSchema?.type).toBe("object");
        const retryPrompt = mockGenerate.mock.calls[1][0] as string;
        expect(retryPrompt).toContain("Title: B");
    });

    it("retries a failed single-job score once", async () => {
        mockGenerate
            .mockRejectedValueOnce(new Error("API error"))
            .mockResolvedValueOnce({
                text: JSON.stringify({ score: 77, reasoning: "Recovered." }),
                model: "test-model",
            });

        const results = await scoreBatchFast([sampleJob], makeResume());
        expect(results).toHaveLength(1);
        expect(results[0].score).toBe(77);
        expect(results[0].failed).toBeUndefined();
        expect(mockGenerate).toHaveBeenCalledTimes(2);
    });

    it("marks missing entries failed when Gemini returns the wrong count", async () => {
        mockGenerate.mockResolvedValue(
            {
                text: JSON.stringify([
                    { score: 88, reasoning: "Strong match." },
                ]), model: "test-model"
            }
        );

        const jobs = [
            { title: "A", company: "X", description: "desc" },
            { title: "B", company: "Y", description: "desc" },
        ];

        const results = await scoreBatchFast(jobs, makeResume());
        expect(results).toHaveLength(2);
        expect(results[0].score).toBe(88);
        expect(results[0].failed).toBeUndefined();
        expect(results[1].failed).toBe(true);
        expect(results[1].score).toBe(0);
    });

    it("marks non-numeric scores failed", async () => {
        mockGenerate.mockResolvedValue(
            {
                text: JSON.stringify([
                    { score: "high", reasoning: "Good." },
                    { score: 70, reasoning: "Solid." },
                ]), model: "test-model"
            }
        );

        const jobs = [
            { title: "A", company: "X", description: "desc" },
            { title: "B", company: "Y", description: "desc" },
        ];

        const results = await scoreBatchFast(jobs, makeResume());
        expect(results[0].failed).toBe(true);
        expect(results[0].score).toBe(0);
        expect(results[1].score).toBe(70);
    });

    it("truncates long descriptions to 4000 chars", async () => {
        mockGenerate.mockResolvedValue(
            {
                text: JSON.stringify([
                    { score: 50, reasoning: "OK." },
                    { score: 50, reasoning: "OK." },
                ]), model: "test-model"
            }
        );

        const jobs = [
            { title: "A", company: "X", description: "x".repeat(5000) },
            { title: "B", company: "Y", description: "desc" },
        ];

        await scoreJobBatch(jobs, makeResume());
        const prompt = mockGenerate.mock.calls[0][0] as string;
        expect(prompt).toContain("x".repeat(4000));
        expect(prompt).not.toContain("x".repeat(4001));
    });
});

