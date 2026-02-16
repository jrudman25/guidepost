import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/stats
 * Returns dashboard statistics.
 */
export async function GET() {
    try {
        const supabase = await createClient();

        // Get all applications
        const { data: applications } = await supabase
            .from("applications")
            .select("*")
            .order("applied_at", { ascending: false });

        const apps = applications || [];

        // Applications this week
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const applicationsThisWeek = apps.filter(
            (a) => new Date(a.applied_at) >= oneWeekAgo
        ).length;

        // Applications this month
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const applicationsThisMonth = apps.filter(
            (a) => new Date(a.applied_at) >= oneMonthAgo
        ).length;

        // Response rate (% that moved past "applied")
        const totalApps = apps.length;
        const responded = apps.filter(
            (a) => a.status !== "applied" && a.status !== "ghosted"
        ).length;
        const responseRate = totalApps > 0 ? Math.round((responded / totalApps) * 100) : 0;

        // Avg days to hear back (from applied_at to status_updated_at for non-"applied" statuses)
        const respondedApps = apps.filter(
            (a) => a.status !== "applied" && a.status !== "ghosted" && a.status_updated_at
        );
        let avgDaysToHearBack = 0;
        if (respondedApps.length > 0) {
            const totalDays = respondedApps.reduce((sum, a) => {
                const applied = new Date(a.applied_at);
                const updated = new Date(a.status_updated_at);
                return sum + Math.max(0, (updated.getTime() - applied.getTime()) / (1000 * 60 * 60 * 24));
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
            const weekStart = new Date();
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

        // Active resumes count
        const { count: activeResumes } = await supabase
            .from("resumes")
            .select("*", { count: "exact", head: true })
            .eq("is_active", true);

        // Top skills from matched job listings
        const { data: jobListings } = await supabase
            .from("job_listings")
            .select("description")
            .not("description", "is", null)
            .order("match_score", { ascending: false })
            .limit(50);

        // Get resume skills for comparison
        const { data: resumes } = await supabase
            .from("resumes")
            .select("parsed_data")
            .eq("is_active", true);

        const resumeSkills: string[] = [];
        resumes?.forEach((r) => {
            const parsed = r.parsed_data as { skills?: string[] } | null;
            if (parsed?.skills) {
                resumeSkills.push(...parsed.skills);
            }
        });

        // New job listings this week
        const { count: newJobsThisWeek } = await supabase
            .from("job_listings")
            .select("*", { count: "exact", head: true })
            .gte("discovered_at", oneWeekAgo.toISOString());

        return NextResponse.json({
            applicationsThisWeek,
            applicationsThisMonth,
            responseRate,
            avgDaysToHearBack,
            statusBreakdown,
            weeklyApplications,
            activeResumes: activeResumes || 0,
            newJobsThisWeek: newJobsThisWeek || 0,
            resumeSkills: [...new Set(resumeSkills)],
            totalApplications: totalApps,
            totalJobListings: jobListings?.length || 0,
        });
    } catch (error) {
        console.error("Stats error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
