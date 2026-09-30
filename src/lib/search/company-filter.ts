function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary match so "Meta" doesn't exclude "Metabase".
 */
export function isExcludedCompany(
    company: string,
    excluded: string[] | null | undefined
): boolean {
    if (!excluded) return false;
    return excluded.some((term) => {
        const trimmed = term.trim();
        if (!trimmed) return false;
        const pattern = new RegExp(
            `(^|[^a-z0-9])${escapeRegExp(trimmed)}([^a-z0-9]|$)`,
            "i"
        );
        return pattern.test(company);
    });
}
