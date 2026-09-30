import { describe, it, expect } from "vitest";
import { buildJobDedupKey } from "./job-dedup";

describe("buildJobDedupKey", () => {
    it("normalizes case, punctuation, and whitespace", () => {
        const a = buildJobDedupKey(
            "Front End Entry Level",
            "ALBERTSONS Companies",
            "Bellevue, WA"
        );
        const b = buildJobDedupKey(
            " front-end entry level ",
            "albertsons companies",
            "bellevue wa"
        );
        expect(a).toBe(b);
    });

    it("produces different keys for different locations", () => {
        const a = buildJobDedupKey("Engineer", "Acme", "Bellevue, WA");
        const b = buildJobDedupKey("Engineer", "Acme", "Seattle, WA");
        expect(a).not.toBe(b);
    });

    it("handles a null location", () => {
        const key = buildJobDedupKey("Engineer", "Acme", null);
        expect(key).toBe("engineer|acme|");
        expect(buildJobDedupKey("engineer", "ACME", null)).toBe(key);
    });
});
