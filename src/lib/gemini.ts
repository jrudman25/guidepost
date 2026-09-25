import { GoogleGenAI } from "@google/genai";

// Lazy + memoized: the constructor can throw when GEMINI_API_KEY is missing
// (e.g. module evaluated during `next build`), so don't create it at import time.
let client: GoogleGenAI | undefined;
function getClient() {
    return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

const PRIMARY_MODEL = "gemini-3-flash-preview";
const SECONDARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-3.1-flash-lite-preview";
const MAX_ATTEMPTS_PER_MODEL = 2;

/**
 * Generate content with automatic model fallback.
 * Retries transient model errors before falling through the model chain.
 * Returns the generated text and the model name that was used.
 */
export async function generateWithFallback(
    prompt: string,
    timeoutMs: number = 15000
): Promise<{ text: string; model: string }> {
    const models = [PRIMARY_MODEL, SECONDARY_MODEL, FALLBACK_MODEL];

    for (let i = 0; i < models.length; i++) {
        const modelName = models[i];

        for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
            try {
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Gemini timeout after ${timeoutMs}ms`)), timeoutMs)
                );

                const result = await Promise.race([
                    getClient().models.generateContent({ model: modelName, contents: prompt }),
                    timeoutPromise,
                ]);

                const text = result.text ?? "";

                return { text, model: modelName };
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                const isTimeout = msg.toLowerCase().includes("timeout");
                const isRetryable = isTimeout ||
                    msg.includes("503") ||
                    msg.toLowerCase().includes("overloaded") ||
                    msg.toLowerCase().includes("unavailable");

                if (!isRetryable) {
                    throw error;
                }

                if (!isTimeout && attempt < MAX_ATTEMPTS_PER_MODEL) {
                    console.warn(`[gemini] ${modelName} failed on attempt ${attempt}/${MAX_ATTEMPTS_PER_MODEL}, retrying: ${msg}`);
                    continue;
                }

                if (i < models.length - 1) {
                    console.warn(`[gemini] ${modelName} failed, falling back to ${models[i + 1]}: ${msg}`);
                    break;
                }

                throw error;
            }
        }
    }

    // Should never reach here, but satisfy TypeScript
    throw new Error("All Gemini models failed");
}
