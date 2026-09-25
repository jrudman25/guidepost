import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generateContentMock = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
    GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI() {
        return {
            models: {
                generateContent: (params: { model: string; contents: string }) =>
                    generateContentMock(params),
            },
        };
    }),
}));

import { generateWithFallback } from "./gemini";

describe("generateWithFallback", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("retries the current model once for retryable availability errors", async () => {
        generateContentMock
            .mockRejectedValueOnce(new Error("503 unavailable"))
            .mockResolvedValueOnce({ text: "ok" });

        const result = await generateWithFallback("prompt", 1000);

        expect(result).toEqual({ text: "ok", model: "gemini-3-flash-preview" });
        expect(generateContentMock).toHaveBeenCalledTimes(2);
        expect(generateContentMock.mock.calls.map((call) => call[0].model)).toEqual([
            "gemini-3-flash-preview",
            "gemini-3-flash-preview",
        ]);
    });

    it("falls through to the next model after a timeout", async () => {
        vi.useFakeTimers();
        generateContentMock
            .mockImplementationOnce(() => new Promise(() => { }))
            .mockResolvedValueOnce({ text: "secondary ok" });

        const resultPromise = generateWithFallback("prompt", 1000);
        await vi.advanceTimersByTimeAsync(1000);
        const result = await resultPromise;

        expect(result).toEqual({ text: "secondary ok", model: "gemini-2.5-flash" });
        expect(generateContentMock).toHaveBeenCalledTimes(2);
        expect(generateContentMock.mock.calls.map((call) => call[0].model)).toEqual([
            "gemini-3-flash-preview",
            "gemini-2.5-flash",
        ]);
    });
});
