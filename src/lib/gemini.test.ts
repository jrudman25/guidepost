import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generateContentMock = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
    GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI() {
        return {
            models: {
                generateContent: (params: {
                    model: string;
                    contents: string;
                    config?: { responseMimeType?: string; responseJsonSchema?: unknown };
                }) => generateContentMock(params),
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

        expect(result).toEqual({ text: "ok", model: "gemini-3.7-flash" });
        expect(generateContentMock).toHaveBeenCalledTimes(2);
        expect(generateContentMock.mock.calls.map((call) => call[0].model)).toEqual([
            "gemini-3.7-flash",
            "gemini-3.7-flash",
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

        expect(result).toEqual({ text: "secondary ok", model: "gemini-3.6-flash" });
        expect(generateContentMock).toHaveBeenCalledTimes(2);
        expect(generateContentMock.mock.calls.map((call) => call[0].model)).toEqual([
            "gemini-3.7-flash",
            "gemini-3.6-flash",
        ]);
    });

    it("requests JSON mode when a response schema is provided", async () => {
        generateContentMock.mockResolvedValue({ text: "{}" });
        const schema = { type: "object", properties: { score: { type: "number" } } };

        await generateWithFallback("prompt", 1000, { responseJsonSchema: schema });

        const params = generateContentMock.mock.calls[0][0];
        expect(params.config?.responseMimeType).toBe("application/json");
        expect(params.config?.responseJsonSchema).toBe(schema);
    });

    it("sends no config when no response schema is provided", async () => {
        generateContentMock.mockResolvedValue({ text: "ok" });

        await generateWithFallback("prompt", 1000);

        expect(generateContentMock.mock.calls[0][0].config).toBeUndefined();
    });

    it("falls through to the next model on a 429 without retrying", async () => {
        generateContentMock
            .mockRejectedValueOnce(Object.assign(new Error("quota exceeded"), { status: 429 }))
            .mockResolvedValueOnce({ text: "secondary ok" });

        const result = await generateWithFallback("prompt", 1000);

        expect(result).toEqual({ text: "secondary ok", model: "gemini-3.6-flash" });
        expect(generateContentMock).toHaveBeenCalledTimes(2);
        expect(generateContentMock.mock.calls.map((call) => call[0].model)).toEqual([
            "gemini-3.7-flash",
            "gemini-3.6-flash",
        ]);
    });

    it("falls through to the next model on RESOURCE_EXHAUSTED without retrying", async () => {
        generateContentMock
            .mockRejectedValueOnce(new Error("RESOURCE_EXHAUSTED: quota exceeded"))
            .mockResolvedValueOnce({ text: "secondary ok" });

        const result = await generateWithFallback("prompt", 1000);

        expect(result).toEqual({ text: "secondary ok", model: "gemini-3.6-flash" });
        expect(generateContentMock).toHaveBeenCalledTimes(2);
        expect(generateContentMock.mock.calls.map((call) => call[0].model)).toEqual([
            "gemini-3.7-flash",
            "gemini-3.6-flash",
        ]);
    });

    it("throws when every model is rate limited", async () => {
        generateContentMock.mockRejectedValue(
            Object.assign(new Error("429 quota exceeded"), { status: 429 })
        );

        await expect(generateWithFallback("prompt", 1000)).rejects.toThrow("429");
        expect(generateContentMock).toHaveBeenCalledTimes(3);
        expect(generateContentMock.mock.calls.map((call) => call[0].model)).toEqual([
            "gemini-3.7-flash",
            "gemini-3.6-flash",
            "gemini-3.5-flash-lite",
        ]);
    });
});
