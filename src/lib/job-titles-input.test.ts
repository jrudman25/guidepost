import { describe, it, expect } from "vitest";
import { normalizeJobTitles } from "./job-titles-input";

describe("normalizeJobTitles", () => {
    it("accepts a list of titles", () => {
        expect(normalizeJobTitles(["Engineer", "Developer"])).toEqual({
            titles: ["Engineer", "Developer"],
        });
    });

    it("accepts an empty array", () => {
        expect(normalizeJobTitles([])).toEqual({ titles: [] });
    });

    it("trims and drops empty entries", () => {
        expect(normalizeJobTitles(["  Engineer  ", "", "   "])).toEqual({
            titles: ["Engineer"],
        });
    });

    it("dedupes case-insensitively keeping the first occurrence", () => {
        expect(
            normalizeJobTitles(["Engineer", "ENGINEER", "engineer", "Developer"])
        ).toEqual({ titles: ["Engineer", "Developer"] });
    });

    it.each([null, undefined, "Engineer", 5, { title: "Engineer" }])(
        "rejects a non-array input (%s)",
        (input) => {
            expect(normalizeJobTitles(input)).toEqual({
                error: "job_titles must be an array of strings",
            });
        }
    );

    it("rejects non-string entries", () => {
        for (const input of [[5], [["Engineer"]], [null], ["ok", 42]]) {
            expect(normalizeJobTitles(input)).toEqual({
                error: "job_titles must be an array of strings",
            });
        }
    });

    it("rejects a title over 100 characters", () => {
        expect(normalizeJobTitles(["x".repeat(101)])).toEqual({
            error: "Job titles must be 100 characters or fewer",
        });
    });

    it("accepts exactly 8 titles", () => {
        const titles = Array.from({ length: 8 }, (_, i) => `Title ${i}`);
        expect(normalizeJobTitles(titles)).toEqual({ titles });
    });

    it("rejects more than 8 titles", () => {
        const titles = Array.from({ length: 9 }, (_, i) => `Title ${i}`);
        expect(normalizeJobTitles(titles)).toEqual({
            error: "At most 8 job titles are allowed",
        });
    });
});
