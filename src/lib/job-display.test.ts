import { describe, it, expect } from "vitest";
import { displaySource } from "./job-display";

describe("displaySource", () => {
    it("returns null for null", () => {
        expect(displaySource(null)).toBeNull();
    });

    it("returns null for empty string", () => {
        expect(displaySource("")).toBeNull();
    });

    it("returns null for google_jobs", () => {
        expect(displaySource("google_jobs")).toBeNull();
    });

    it("returns the source for a named site", () => {
        expect(displaySource("LinkedIn")).toBe("LinkedIn");
    });
});
