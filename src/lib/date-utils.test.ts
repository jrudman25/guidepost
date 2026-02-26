import { describe, it, expect, vi, afterEach } from "vitest";
import { parseLocalDate, daysSince, toLocalDateString } from "./date-utils";

// ---------------------------------------------------------------------------
// parseLocalDate
// ---------------------------------------------------------------------------

describe("parseLocalDate", () => {
    it("interprets a date-only string as local midnight", () => {
        const d = parseLocalDate("2026-01-06");
        // Should be Jan 6 in local time, not Jan 5 (which would happen with UTC)
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(0); // January
        expect(d.getDate()).toBe(6);
        expect(d.getHours()).toBe(0);
        expect(d.getMinutes()).toBe(0);
    });

    it("passes through ISO strings that already include a time component", () => {
        const d = parseLocalDate("2026-03-15T14:30:00Z");
        expect(d.toISOString()).toBe("2026-03-15T14:30:00.000Z");
    });

    it("passes through full ISO datetime strings", () => {
        const d = parseLocalDate("2026-06-01T00:00:00");
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(5); // June
        expect(d.getDate()).toBe(1);
    });

    it("handles end-of-month dates correctly", () => {
        const d = parseLocalDate("2026-01-31");
        expect(d.getDate()).toBe(31);
        expect(d.getMonth()).toBe(0);
    });

    it("handles leap year dates", () => {
        const d = parseLocalDate("2028-02-29");
        expect(d.getDate()).toBe(29);
        expect(d.getMonth()).toBe(1); // February
    });

    it("preserves timezone offset in datetime strings", () => {
        const d = parseLocalDate("2026-07-04T12:00:00-07:00");
        // Should parse as 19:00 UTC
        expect(d.getUTCHours()).toBe(19);
    });
});

// ---------------------------------------------------------------------------
// daysSince
// ---------------------------------------------------------------------------

describe("daysSince", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns 0 for today's date", () => {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        expect(daysSince(todayStr)).toBe(0);
    });

    it("returns correct number of days for a past date", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 10, 12, 0, 0)); // Jan 10, 2026 noon

        expect(daysSince("2026-01-06")).toBe(4);
        expect(daysSince("2026-01-01")).toBe(9);
    });

    it("returns negative for future dates", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0)); // Jan 5, 2026 noon

        expect(daysSince("2026-01-10")).toBeLessThan(0);
    });

    it("handles cross-month spans", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 1, 5, 12, 0, 0)); // Feb 5, 2026 noon

        expect(daysSince("2026-01-06")).toBe(30);
    });
});

// ---------------------------------------------------------------------------
// toLocalDateString
// ---------------------------------------------------------------------------

describe("toLocalDateString", () => {
    it("returns YYYY-MM-DD for a date-only string", () => {
        expect(toLocalDateString("2026-01-15")).toBe("2026-01-15");
    });

    it("returns YYYY-MM-DD for a datetime string with T00:00:00", () => {
        expect(toLocalDateString("2026-03-22T00:00:00")).toBe("2026-03-22");
    });

    it("extracts the date portion from a UTC timestamptz string", () => {
        // Supabase timestamptz columns return UTC strings like this.
        // toLocalDateString extracts just the YYYY-MM-DD prefix,
        // avoiding any timezone conversion that would shift the date.
        expect(toLocalDateString("2026-01-15T00:00:00.000Z")).toBe("2026-01-15");
    });

    it("zero-pads single-digit months and days", () => {
        expect(toLocalDateString("2026-03-05")).toBe("2026-03-05");
        expect(toLocalDateString("2026-01-01")).toBe("2026-01-01");
    });

    it("handles end-of-year dates", () => {
        expect(toLocalDateString("2026-12-31")).toBe("2026-12-31");
    });
});
