export function getScoreColor(score: number | null): string {
    if (!score) return "bg-muted text-muted-foreground";
    if (score >= 80) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    if (score >= 60) return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    if (score >= 40) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    return "bg-red-500/15 text-red-400 border-red-500/30";
}

export function formatPostedAt(postedAt: string | null): string | null {
    if (!postedAt) return null;

    const posted = new Date(postedAt);
    if (Number.isNaN(posted.getTime())) return null;

    const days = Math.floor((Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return "Posted today";
    if (days === 1) return "Posted 1 day ago";
    if (days < 30) return `Posted ${days} days ago`;

    return `Posted ${posted.toLocaleDateString()}`;
}

export function displaySource(source: string | null): string | null {
    if (!source) return null;
    const trimmed = source.trim();
    if (!trimmed || trimmed === "google_jobs") return null;
    return trimmed;
}
