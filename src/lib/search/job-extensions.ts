import type { SerpApiJob } from "./serpapi";

/**
 * Parse SerpAPI's relative "posted at" strings (e.g. "3 days ago",
 * "yesterday") into a Date. Returns null for unparseable values.
 */
export function parseSerpApiPostedAt(postedAt: string | undefined): Date | null {
    if (!postedAt) return null;

    const normalized = postedAt.trim().toLowerCase();
    const now = Date.now();

    if (
        normalized === "today" ||
        normalized === "just posted" ||
        normalized === "recently" ||
        normalized === "new"
    ) {
        return new Date(now);
    }

    if (normalized === "yesterday") {
        return new Date(now - 24 * 60 * 60 * 1000);
    }

    const match = normalized.match(/^(\d+|\ba\b|an)\+?\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months)\s+ago$/);
    if (!match) return null;

    const amount = match[1] === "a" || match[1] === "an"
        ? 1
        : Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
        minute: 60 * 1000,
        minutes: 60 * 1000,
        hour: 60 * 60 * 1000,
        hours: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        weeks: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        months: 30 * 24 * 60 * 60 * 1000,
    };

    return new Date(now - amount * multipliers[unit]);
}

// SerpAPI salaries look like "80K-95K a year" or "$50 an hour"; this picks
// those out of the free-form `extensions` string array.
const SALARY_PATTERN = /\b(a|an|per)\s+(year|hour|month|week|day)\b/i;

/**
 * Extract job metadata (posted date, salary, work-from-home) from a SerpAPI
 * result. Prefers `detected_extensions` and falls back to parsing the
 * `extensions` string array, which is what SerpAPI currently returns.
 */
export function getJobExtensions(job: SerpApiJob): {
    posted_at?: string;
    salary?: string;
    work_from_home: boolean;
} {
    const detected = job.detected_extensions;
    const extensions = job.extensions ?? [];

    const posted_at = detected?.posted_at
        ?? extensions.find((entry) => parseSerpApiPostedAt(entry) !== null);

    const salary = detected?.salary
        ?? extensions.find((entry) => SALARY_PATTERN.test(entry) || entry.includes("$"));

    const work_from_home = detected?.work_from_home === true
        || extensions.some((entry) => entry.trim().toLowerCase() === "work from home");

    return { posted_at, salary, work_from_home };
}
