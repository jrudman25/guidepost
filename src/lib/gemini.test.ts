import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generateContentMock = vi.hoisted(() => vi.fn());
const getGenerativeModelMock = vi.hoisted(() => vi.fn());

vi.mock("@google/generative-ai", () => ({
    GoogleGenerativeAI: vi.fn().mockImplementation(function GoogleGenerativeAI() {
        return {
            getGenerativeModel: getGenerativeModelMock,
        };
    }),
}));

import { generateWithFallback } from "./gemini";

describe("generateWithFallback", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        getGenerativeModelMock.mockImplementation(({ model }: { model: string }) => ({
            generateContent: (prompt: string) => generateContentMock(model, prompt),
        }));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("retries the current model once for retryable availability errors", async () => {
        generateContentMock
            .mockRejectedValueOnce(new Error("503 unavailable"))
            .mockResolvedValueOnce({ response: { text: () => "ok" } });

        const result = await generateWithFallback("prompt", 1000);

        expect(result).toEqual({ text: "ok", model: "gemini-3-flash-preview" });
        expect(generateContentMock).toHaveBeenCalledTimes(2);
        expect(generateContentMock.mock.calls.map((call) => call[0])).toEqual([
            "gemini-3-flash-preview",
            "gemini-3-flash-preview",
        ]);
    });

    it("falls through to the next model after a timeout", async () => {
        vi.useFakeTimers();
        generateContentMock
            .mockImplementationOnce(() => new Promise(() => { }))
            .mockResolvedValueOnce({ response: { text: () => "secondary ok" } });

        const resultPromise = generateWithFallback("prompt", 1000);
        await vi.advanceTimersByTimeAsync(1000);
        const result = await resultPromise;

        expect(result).toEqual({ text: "secondary ok", model: "gemini-2.5-flash" });
        expect(generateContentMock).toHaveBeenCalledTimes(2);
        expect(generateContentMock.mock.calls.map((call) => call[0])).toEqual([
            "gemini-3-flash-preview",
            "gemini-2.5-flash",
        ]);
    });
});
