export const MAX_JOB_TITLES = 8;
const MAX_TITLE_LENGTH = 100;

/**
 * Validate and normalize a user-supplied job_titles array for
 * resumes.parsed_data.job_titles. Empty arrays are allowed.
 */
export function normalizeJobTitles(
    input: unknown
): { titles: string[] } | { error: string } {
    if (!Array.isArray(input)) {
        return { error: "job_titles must be an array of strings" };
    }

    const seen = new Set<string>();
    const titles: string[] = [];
    for (const item of input) {
        if (typeof item !== "string") {
            return { error: "job_titles must be an array of strings" };
        }
        const trimmed = item.trim();
        if (!trimmed) continue;
        if (trimmed.length > MAX_TITLE_LENGTH) {
            return { error: `Job titles must be ${MAX_TITLE_LENGTH} characters or fewer` };
        }
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        titles.push(trimmed);
    }

    if (titles.length > MAX_JOB_TITLES) {
        return { error: `At most ${MAX_JOB_TITLES} job titles are allowed` };
    }

    return { titles };
}
