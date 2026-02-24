/**
 * Pure computation functions for dashboard statistics.
 * Extracted from the stats API route for testability.
 */

/** Minimal application shape needed for stats computation. */
export interface StatsApplication {
    applied_at: string;
    status: string;
    status_updated_at: string;
    heard_back_at: string | null;
}

export interface StatsResult {
    applicationsThisWeek: number;
    applicationsThisMonth: number;
    responseRate: number;
    avgDaysToHearBack: number;
    statusBreakdown: Record<string, number>;
    weeklyApplications: { week: string; count: number }[];
    totalApplications: number;
}

/**
 * Compute dashboard statistics from a list of applications.
 * @param apps - application records from the database
 * @param now  - reference date (defaults to Date.now, injectable for testing)
 */
export function computeStats(
    apps: StatsApplication[],
    now: Date = new Date()
): StatsResult {
    // Applications this week
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const applicationsThisWeek = apps.filter(
        (a) => new Date(a.applied_at) >= oneWeekAgo
    ).length;

    // Applications this month
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const applicationsThisMonth = apps.filter(
        (a) => new Date(a.applied_at) >= oneMonthAgo
    ).length;

    // Response rate (% that moved past "applied", excluding "ghosted")
    const totalApps = apps.length;
    const responded = apps.filter(
        (a) => a.status !== "applied" && a.status !== "ghosted"
    ).length;
    const responseRate =
        totalApps > 0 ? Math.round((responded / totalApps) * 100) : 0;

    // Avg days to hear back (from applied_at to heard_back_at or status_updated_at)
    const respondedApps = apps.filter(
        (a) =>
            a.status !== "applied" &&
            a.status !== "ghosted" &&
            (a.heard_back_at || a.status_updated_at)
    );
    let avgDaysToHearBack = 0;
    if (respondedApps.length > 0) {
        const totalDays = respondedApps.reduce((sum, a) => {
            const applied = new Date(a.applied_at);
            const heardBack = new Date(a.heard_back_at || a.status_updated_at);
            return (
                sum +
                Math.max(
                    0,
                    (heardBack.getTime() - applied.getTime()) /
                    (1000 * 60 * 60 * 24)
                )
            );
        }, 0);
        avgDaysToHearBack = Math.round(totalDays / respondedApps.length);
    }

    // Status breakdown
    const statusBreakdown: Record<string, number> = {
        applied: 0,
        screening: 0,
        interview: 0,
        offer: 0,
        rejected: 0,
        ghosted: 0,
    };
    apps.forEach((a) => {
        statusBreakdown[a.status] = (statusBreakdown[a.status] || 0) + 1;
    });

    // Weekly applications (last 8 weeks)
    const weeklyApplications: { week: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - i * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const count = apps.filter((a) => {
            const d = new Date(a.applied_at);
            return d >= weekStart && d < weekEnd;
        }).length;

        weeklyApplications.push({
            week: weekStart.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
            }),
            count,
        });
    }

    return {
        applicationsThisWeek,
        applicationsThisMonth,
        responseRate,
        avgDaysToHearBack,
        statusBreakdown,
        weeklyApplications,
        totalApplications: totalApps,
    };
}
