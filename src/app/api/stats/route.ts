import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeStats, type StatsApplication } from "./stats";

/**
 * GET /api/stats
 * Returns dashboard statistics.
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        // Get all applications
        const { data: applications } = await supabase
            .from("applications")
            .select("*")
            .order("applied_at", { ascending: false });

        const apps = (applications || []) as StatsApplication[];

        const today = new Date();

        if (user?.email === "demo@guidepostai.app" && apps.length > 0) {
            const maxDate = new Date(Math.max(...apps.map(a => new Date(a.applied_at).getTime())));
            // Move dates forward so the most recent application lands safely inside today's bucket (-1 hour)
            const offsetMs = today.getTime() - maxDate.getTime() - (60 * 60 * 1000);

            apps.forEach(app => {
                const applied = new Date(app.applied_at);
                app.applied_at = new Date(applied.getTime() + offsetMs).toISOString();

                if (app.heard_back_at) {
                    const heard = new Date(app.heard_back_at);
                    app.heard_back_at = new Date(heard.getTime() + offsetMs).toISOString();
                }

                if (app.status_updated_at) {
                    const updated = new Date(app.status_updated_at);
                    app.status_updated_at = new Date(updated.getTime() + offsetMs).toISOString();
                }
            });
        }

        // Compute pure stats from application data
        // Pass `today` if we are shifting dates, so we synchronously measure relative to the same millisecond 
        const stats = computeStats(apps, user?.email === "demo@guidepostai.app" ? today : undefined);

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
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const { count: newJobsThisWeek } = await supabase
            .from("job_listings")
            .select("*", { count: "exact", head: true })
            .gte("discovered_at", oneWeekAgo.toISOString());

        return NextResponse.json({
            ...stats,
            userName: user?.email === "demo@guidepostai.app" ? "Guest" : "Jordan",
            activeResumes: activeResumes || 0,
            newJobsThisWeek: newJobsThisWeek || 0,
            resumeSkills: [...new Set(resumeSkills)],
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
