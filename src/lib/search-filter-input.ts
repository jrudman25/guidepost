import type { SearchFilter } from "@/lib/types";

export type SearchFilterInput = Pick<
    SearchFilter,
    | "keywords"
    | "location"
    | "remote_preference"
    | "target_seniority"
    | "min_salary"
    | "max_listing_age_days"
    | "excluded_companies"
>;

const MAX_LIST_ITEMS = 50;
const MAX_LIST_ITEM_LENGTH = 100;
const MAX_LOCATION_LENGTH = 200;
const MAX_SALARY = 10_000_000;
const ALLOWED_LISTING_AGES = [1, 3, 7, 14, 30];
const REMOTE_PREFERENCES = ["remote", "hybrid", "onsite", "any"];
const SENIORITY_LEVELS = ["entry", "mid", "senior", "any"];

function normalizeStringList(
    value: unknown,
    field: string
): { data: string[] } | { error: string } {
    if (value === undefined || value === null) {
        return { data: [] };
    }
    if (!Array.isArray(value)) {
        return { error: `${field} must be an array of strings` };
    }
    const seen = new Set<string>();
    const items: string[] = [];
    for (const item of value) {
        if (typeof item !== "string") {
            return { error: `${field} must be an array of strings` };
        }
        const trimmed = item.trim();
        if (!trimmed) continue;
        if (trimmed.length > MAX_LIST_ITEM_LENGTH) {
            return { error: `${field} entries must be ${MAX_LIST_ITEM_LENGTH} characters or fewer` };
        }
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(trimmed);
    }
    if (items.length > MAX_LIST_ITEMS) {
        return { error: `${field} supports at most ${MAX_LIST_ITEMS} entries` };
    }
    return { data: items };
}

/**
 * Validate and normalize a PUT /api/filters request body into the columns
 * stored on the user's single search_filters row.
 */
export function parseSearchFilterInput(
    body: unknown
): { data: SearchFilterInput } | { error: string } {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: "Request body must be an object" };
    }
    const input = body as Record<string, unknown>;

    const keywords = normalizeStringList(input.keywords, "keywords");
    if ("error" in keywords) return keywords;

    const excludedCompanies = normalizeStringList(input.excluded_companies, "excluded_companies");
    if ("error" in excludedCompanies) return excludedCompanies;

    let location: string | null = null;
    if (input.location !== undefined && input.location !== null) {
        if (typeof input.location !== "string") {
            return { error: "location must be a string" };
        }
        const trimmed = input.location.trim();
        if (trimmed.length > MAX_LOCATION_LENGTH) {
            return { error: `location must be ${MAX_LOCATION_LENGTH} characters or fewer` };
        }
        location = trimmed || null;
    }

    let remotePreference: SearchFilter["remote_preference"] = "any";
    if (input.remote_preference !== undefined && input.remote_preference !== null) {
        if (!REMOTE_PREFERENCES.includes(input.remote_preference as string)) {
            return { error: `remote_preference must be one of: ${REMOTE_PREFERENCES.join(", ")}` };
        }
        remotePreference = input.remote_preference as SearchFilter["remote_preference"];
    }

    let targetSeniority: SearchFilter["target_seniority"] = "any";
    if (input.target_seniority !== undefined && input.target_seniority !== null) {
        if (!SENIORITY_LEVELS.includes(input.target_seniority as string)) {
            return { error: `target_seniority must be one of: ${SENIORITY_LEVELS.join(", ")}` };
        }
        targetSeniority = input.target_seniority as SearchFilter["target_seniority"];
    }

    let minSalary: number | null = null;
    if (
        input.min_salary !== undefined &&
        input.min_salary !== null &&
        input.min_salary !== ""
    ) {
        if (
            typeof input.min_salary !== "number" ||
            !Number.isInteger(input.min_salary) ||
            input.min_salary < 0 ||
            input.min_salary > MAX_SALARY
        ) {
            return { error: `min_salary must be an integer between 0 and ${MAX_SALARY}` };
        }
        minSalary = input.min_salary;
    }

    let maxListingAgeDays = 7;
    if (input.max_listing_age_days !== undefined && input.max_listing_age_days !== null) {
        if (!ALLOWED_LISTING_AGES.includes(input.max_listing_age_days as number)) {
            return { error: `max_listing_age_days must be one of: ${ALLOWED_LISTING_AGES.join(", ")}` };
        }
        maxListingAgeDays = input.max_listing_age_days as number;
    }

    return {
        data: {
            keywords: keywords.data,
            location,
            remote_preference: remotePreference,
            target_seniority: targetSeniority,
            min_salary: minSalary,
            max_listing_age_days: maxListingAgeDays,
            excluded_companies: excludedCompanies.data,
        },
    };
}
