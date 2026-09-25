import { describe, it, expect } from "vitest";
import { parseSearchFilterInput } from "./search-filter-input";

function validBody(overrides: Record<string, unknown> = {}) {
    return {
        keywords: ["react", "fintech"],
        location: "San Francisco, CA",
        remote_preference: "remote",
        target_seniority: "senior",
        min_salary: 120000,
        max_listing_age_days: 14,
        excluded_companies: ["SpamCorp"],
        ...overrides,
    };
}

describe("parseSearchFilterInput", () => {
    it("accepts a complete valid input", () => {
        const result = parseSearchFilterInput(validBody());
        expect(result).toEqual({
            data: {
                keywords: ["react", "fintech"],
                location: "San Francisco, CA",
                remote_preference: "remote",
                target_seniority: "senior",
                min_salary: 120000,
                max_listing_age_days: 14,
                excluded_companies: ["SpamCorp"],
            },
        });
    });

    it("applies defaults for missing fields", () => {
        const result = parseSearchFilterInput({});
        expect(result).toEqual({
            data: {
                keywords: [],
                location: null,
                remote_preference: "any",
                target_seniority: "any",
                min_salary: null,
                max_listing_age_days: 7,
                excluded_companies: [],
            },
        });
    });

    it("trims, drops empties, and dedupes list entries case-insensitively", () => {
        const result = parseSearchFilterInput(
            validBody({
                keywords: ["  React ", "", "react", "NODE", "node", "   "],
                excluded_companies: ["SpamCorp", " spamcorp "],
            })
        );
        expect(result).toEqual({
            data: expect.objectContaining({
                keywords: ["React", "NODE"],
                excluded_companies: ["SpamCorp"],
            }),
        });
    });

    it("trims location and maps empty string to null", () => {
        expect(parseSearchFilterInput(validBody({ location: "  Austin, TX  " }))).toEqual({
            data: expect.objectContaining({ location: "Austin, TX" }),
        });
        expect(parseSearchFilterInput(validBody({ location: "   " }))).toEqual({
            data: expect.objectContaining({ location: null }),
        });
        expect(parseSearchFilterInput(validBody({ location: null }))).toEqual({
            data: expect.objectContaining({ location: null }),
        });
    });

    it.each([null, undefined, "", "nope", 42])(
        "rejects a non-object body (%s)",
        (body) => {
            expect(parseSearchFilterInput(body)).toEqual({
                error: "Request body must be an object",
            });
        }
    );

    it("rejects an array body", () => {
        expect(parseSearchFilterInput([1, 2])).toEqual({
            error: "Request body must be an object",
        });
    });

    it("rejects a non-array keywords field", () => {
        expect(parseSearchFilterInput(validBody({ keywords: "react" }))).toEqual({
            error: "keywords must be an array of strings",
        });
    });

    it("rejects non-string list entries", () => {
        expect(
            parseSearchFilterInput(validBody({ excluded_companies: ["ok", 5] }))
        ).toEqual({ error: "excluded_companies must be an array of strings" });
    });

    it("rejects list entries over 100 characters", () => {
        expect(
            parseSearchFilterInput(validBody({ keywords: ["x".repeat(101)] }))
        ).toEqual({ error: "keywords entries must be 100 characters or fewer" });
    });

    it("rejects more than 50 list entries", () => {
        const keywords = Array.from({ length: 51 }, (_, i) => `kw-${i}`);
        expect(parseSearchFilterInput(validBody({ keywords }))).toEqual({
            error: "keywords supports at most 50 entries",
        });
    });

    it("rejects a location over 200 characters", () => {
        expect(
            parseSearchFilterInput(validBody({ location: "x".repeat(201) }))
        ).toEqual({ error: "location must be 200 characters or fewer" });
    });

    it("rejects a non-string location", () => {
        expect(parseSearchFilterInput(validBody({ location: 5 }))).toEqual({
            error: "location must be a string",
        });
    });

    it("rejects an invalid remote_preference", () => {
        expect(
            parseSearchFilterInput(validBody({ remote_preference: "remote-ish" }))
        ).toEqual({
            error: "remote_preference must be one of: remote, hybrid, onsite, any",
        });
    });

    it("rejects an invalid target_seniority", () => {
        expect(
            parseSearchFilterInput(validBody({ target_seniority: "principal" }))
        ).toEqual({
            error: "target_seniority must be one of: entry, mid, senior, any",
        });
    });

    it.each([0, 50_000, 10_000_000])("accepts min_salary %s", (value) => {
        expect(parseSearchFilterInput(validBody({ min_salary: value }))).toEqual({
            data: expect.objectContaining({ min_salary: value }),
        });
    });

    it.each([-1, 10_000_001, 1.5, "80000", true])(
        "rejects min_salary %s",
        (value) => {
            expect(parseSearchFilterInput(validBody({ min_salary: value }))).toEqual({
                error: "min_salary must be an integer between 0 and 10000000",
            });
        }
    );

    it.each([1, 3, 7, 14, 30])("accepts max_listing_age_days %s", (value) => {
        expect(
            parseSearchFilterInput(validBody({ max_listing_age_days: value }))
        ).toEqual({ data: expect.objectContaining({ max_listing_age_days: value }) });
    });

    it.each([2, 0, "7", 60])("rejects max_listing_age_days %s", (value) => {
        expect(
            parseSearchFilterInput(validBody({ max_listing_age_days: value }))
        ).toEqual({ error: "max_listing_age_days must be one of: 1, 3, 7, 14, 30" });
    });
});
