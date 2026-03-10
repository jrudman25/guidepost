import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const PRIMARY_MODEL = "gemini-3-flash-preview";
const SECONDARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-3.1-flash-lite-preview";

/**
 * Generate content with automatic model fallback.
 * If the primary model returns a 503 (overloaded), retries
 * with the fallback model.
 * Returns the generated text and the model name that was used.
 */
export async function generateWithFallback(
    prompt: string,
    timeoutMs: number = 15000
): Promise<{ text: string; model: string }> {
    const models = [PRIMARY_MODEL, SECONDARY_MODEL, FALLBACK_MODEL];

    for (let i = 0; i < models.length; i++) {
        const modelName = models[i];
        const model = genAI.getGenerativeModel({ model: modelName });

        try {
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Gemini timeout after ${timeoutMs}ms`)), timeoutMs)
            );

            const result = await Promise.race([
                model.generateContent(prompt),
                timeoutPromise,
            ]);

            const text = result.response.text();

            return { text, model: modelName };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            const is503 = msg.includes("503") || msg.includes("overloaded") || msg.includes("unavailable");

            // If 503 and we have a fallback, try it
            if (is503 && i < models.length - 1) {
                console.warn(`[gemini] ${modelName} unavailable (503), falling back to ${models[i + 1]}`);
                continue;
            }

            // Otherwise, re-throw
            throw error;
        }
    }

    // Should never reach here, but satisfy TypeScript
    throw new Error("All Gemini models failed");
}
