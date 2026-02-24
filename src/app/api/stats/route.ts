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

        // Get all applications
        const { data: applications } = await supabase
            .from("applications")
            .select("*")
            .order("applied_at", { ascending: false });

        const apps = (applications || []) as StatsApplication[];

        // Compute pure stats from application data
        const stats = computeStats(apps);

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
