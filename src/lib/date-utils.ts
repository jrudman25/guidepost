/**
 * Date utility functions for safe date parsing across timezones.
 *
 * JavaScript's `new Date("2026-01-06")` interprets date-only strings as
 * UTC midnight, which displays as the previous day in timezones behind UTC.
 * These helpers force local-timezone interpretation instead.
 */

/**
 * Parse a date string as local time (not UTC).
 *
 * Appends `T00:00:00` to date-only strings (e.g. "2026-01-06")
 * so they are interpreted as local midnight rather than UTC midnight.
 * Strings that already include a time component are passed through.
 */
export function parseLocalDate(dateStr: string): Date {
    if (dateStr.includes("T")) return new Date(dateStr);
    return new Date(dateStr + "T00:00:00");
}

/**
 * Return the number of whole days between a date string and now.
 */
export function daysSince(dateStr: string): number {
    const date = parseLocalDate(dateStr);
    const now = new Date();
    return Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );
}

/**
 * Extract a `YYYY-MM-DD` string from any date/datetime string.
 *
 * For date-only strings ("2026-01-06"), returns them as-is.
 * For timestamptz strings ("2026-01-06T00:00:00+00:00"), extracts
 * just the date portion — avoiding timezone conversion that would
 * shift the date backwards in western timezones.
 */
export function toLocalDateString(dateStr: string): string {
    // Date-only strings and ISO timestamps both start with YYYY-MM-DD
    return dateStr.substring(0, 10);
}
