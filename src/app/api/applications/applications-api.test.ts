import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// buildUpdateData — extracted logic from PATCH /api/applications/[id]
//
// Instead of mocking Supabase, we test the field-selection logic directly.
// This is the same logic used in the route handler to pick which fields
// from the request body get sent to the database.
// ---------------------------------------------------------------------------

/**
 * Build the update payload from a request body.
 * Only defined (not undefined) fields are included.
 */
function buildUpdateData(body: Record<string, unknown>): Record<string, unknown> {
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
        "status",
        "notes",
        "applied_via",
        "url",
        "job_title",
        "company",
        "applied_at",
        "heard_back_at",
    ];

    for (const field of allowedFields) {
        if (body[field] !== undefined) {
            updateData[field] = body[field];
        }
    }

    return updateData;
}

describe("buildUpdateData (PATCH field selection)", () => {
    it("includes all supported fields when present", () => {
        const body = {
            status: "interview",
            notes: "Great call",
            applied_via: "LinkedIn",
            url: "https://example.com",
            job_title: "Senior Engineer",
            company: "Acme Corp",
            applied_at: "2026-01-06",
            heard_back_at: "2026-01-10",
        };

        const result = buildUpdateData(body);
        expect(result).toEqual(body);
    });

    it("only includes defined fields", () => {
        const body = { status: "rejected", notes: "No response" };
        const result = buildUpdateData(body);
        expect(result).toEqual({ status: "rejected", notes: "No response" });
        expect(result).not.toHaveProperty("heard_back_at");
        expect(result).not.toHaveProperty("job_title");
    });

    it("ignores unknown fields", () => {
        const body = {
            status: "offer",
            random_field: "should be ignored",
            hacker: "drop table",
        };

        const result = buildUpdateData(body);
        expect(result).toEqual({ status: "offer" });
        expect(result).not.toHaveProperty("random_field");
        expect(result).not.toHaveProperty("hacker");
    });

    it("includes heard_back_at when set to null (to clear it)", () => {
        const body = { heard_back_at: null };
        const result = buildUpdateData(body);
        expect(result).toEqual({ heard_back_at: null });
    });

    it("includes heard_back_at when set to a date string", () => {
        const body = { heard_back_at: "2026-02-15" };
        const result = buildUpdateData(body);
        expect(result).toEqual({ heard_back_at: "2026-02-15" });
    });

    it("returns empty object when body is empty", () => {
        const result = buildUpdateData({});
        expect(result).toEqual({});
    });

    it("returns empty object when body has only unknown fields", () => {
        const result = buildUpdateData({ foo: "bar", baz: 123 });
        expect(result).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// Payload sanitization — mirrors what the applications page form does
// before sending to the API.
// ---------------------------------------------------------------------------

describe("form payload sanitization", () => {
    it("converts empty heard_back_at string to null", () => {
        const form = {
            job_title: "Engineer",
            company: "Acme",
            applied_at: "2026-01-06",
            applied_via: "LinkedIn",
            status: "applied",
            notes: "",
            url: "",
            heard_back_at: "",
        };

        const payload = {
            ...form,
            heard_back_at: form.heard_back_at || null,
        };

        expect(payload.heard_back_at).toBeNull();
    });

    it("preserves heard_back_at when it has a value", () => {
        const form = {
            job_title: "Engineer",
            company: "Acme",
            applied_at: "2026-01-06",
            applied_via: "",
            status: "interview",
            notes: "",
            url: "",
            heard_back_at: "2026-01-20",
        };

        const payload = {
            ...form,
            heard_back_at: form.heard_back_at || null,
        };

        expect(payload.heard_back_at).toBe("2026-01-20");
    });
});

// ---------------------------------------------------------------------------
// Pagination parsing logic (extracted from GET /api/applications)
// ---------------------------------------------------------------------------

function parsePaginationParams(searchParams: URLSearchParams) {
    const limitParams = searchParams.get("limit");
    const offsetParams = searchParams.get("offset");

    // Use default values 20/0 if null/missing/empty
    const limit = limitParams ? parseInt(limitParams) : 20;
    const offset = offsetParams ? parseInt(offsetParams) : 0;

    return {
        limit: isNaN(limit) ? 20 : limit,
        offset: isNaN(offset) ? 0 : offset,
    };
}

describe("parsePaginationParams", () => {
    it("returns default limit 20 and offset 0 when params are missing", () => {
        const searchParams = new URLSearchParams("");
        const result = parsePaginationParams(searchParams);
        expect(result).toEqual({ limit: 20, offset: 0 });
    });

    it("parses valid limit and offset", () => {
        const searchParams = new URLSearchParams("limit=50&offset=100");
        const result = parsePaginationParams(searchParams);
        expect(result).toEqual({ limit: 50, offset: 100 });
    });

    it("falls back to defaults if parsing returns NaN", () => {
        const searchParams = new URLSearchParams("limit=foo&offset=bar");
        const result = parsePaginationParams(searchParams);
        expect(result).toEqual({ limit: 20, offset: 0 });
    });
});
