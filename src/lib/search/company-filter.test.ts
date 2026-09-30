import { describe, it, expect } from "vitest";
import { isExcludedCompany } from "./company-filter";

describe("isExcludedCompany", () => {
    it("excludes an exact company name", () => {
        expect(isExcludedCompany("Meta", ["Meta"])).toBe(true);
    });

    it("excludes a company that starts with the term", () => {
        expect(isExcludedCompany("Meta Platforms, Inc.", ["Meta"])).toBe(true);
    });

    it("does not exclude a company that merely starts with the same letters", () => {
        expect(isExcludedCompany("Metabase", ["Meta"])).toBe(false);
    });

    it("matches case-insensitively", () => {
        expect(isExcludedCompany("Amazon Web Services", ["amazon"])).toBe(true);
    });

    it("matches terms containing regex special characters", () => {
        expect(isExcludedCompany("AT&T Inc.", ["AT&T"])).toBe(true);
    });

    it("returns false for an empty list", () => {
        expect(isExcludedCompany("Acme", [])).toBe(false);
    });

    it("returns false for undefined", () => {
        expect(isExcludedCompany("Acme", undefined)).toBe(false);
    });

    it("ignores blank terms", () => {
        expect(isExcludedCompany("Acme", ["  "])).toBe(false);
    });
});
