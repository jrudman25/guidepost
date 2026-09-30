/**
 * Build a secondary dedup key for a job listing. Reposts of the same job
 * often arrive with different URLs (LinkedIn, bebee, monster, etc.), so
 * title + company + location is used to catch them.
 *
 * Each part is lowercased, non-alphanumeric characters become spaces,
 * whitespace is collapsed, and the parts are joined with "|".
 */
export function buildJobDedupKey(
    title: string,
    company: string,
    location: string | null
): string {
    const normalize = (part: string | null) =>
        (part ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim()
            .replace(/\s+/g, " ");

    return [normalize(title), normalize(company), normalize(location)].join("|");
}
