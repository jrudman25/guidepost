import { NextResponse } from "next/server";
import { executeJobSearch } from "@/lib/search/execute";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/cron/daily-search
 * Called by Vercel Cron daily at 8 AM Pacific (4 PM UTC).
 * Triggers a search for all active resumes.
 *
 * This endpoint is excluded from auth middleware via the matcher config,
 * and uses CRON_SECRET for authorization instead.
 */
export async function GET(request: Request) {
    try {
        // Verify cron secret to prevent unauthorized calls
        const authHeader = request.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Use service role client (bypasses RLS since cron has no user session)
        const supabase = createServiceClient();

        // 1. Clean up old dismissed jobs (older than 3 months) to save DB space
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const { error: cleanupError } = await supabase
            .from("job_listings")
            .delete()
            .eq("status", "dismissed")
            .lt("discovered_at", threeMonthsAgo.toISOString());

        if (cleanupError) {
            console.error("Failed to cleanup old jobs:", cleanupError);
            // Non-fatal, continue with search
        }

        // 2. Execute search directly (no HTTP round-trip needed)
        const result = await executeJobSearch(undefined, supabase);

        return NextResponse.json({
            success: true,
            triggered_at: new Date().toISOString(),
            ...result,
        });
    } catch (error) {
        console.error("Cron job error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Cron job failed" },
            { status: 500 }
        );
    }
}
