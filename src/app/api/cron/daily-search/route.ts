import { NextResponse } from "next/server";
import { executeJobSearch } from "@/lib/search/execute";
import { createServiceClient } from "@/lib/supabase/service";
import { PipelineLogger } from "@/lib/pipeline-logger";
import { createBackup, pruneOldBackups } from "@/lib/db-backup";

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

        // 1. Daily database backup (run first so data is captured even if search fails)
        const backupResult = await createBackup(supabase);

        // 2. Prune old backups (older than 30 days)
        await pruneOldBackups(supabase);

        // 3. Clean up old dismissed jobs (older than 3 months) to save DB space
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const { error: cleanupError } = await supabase
            .from("job_listings")
            .delete()
            .eq("status", "dismissed")
            .lt("discovered_at", threeMonthsAgo.toISOString());

        if (cleanupError) {
            console.error("Failed to cleanup old jobs:", cleanupError);
        }

        // 4. Prune old pipeline logs (older than 14 days)
        const prunedCount = await PipelineLogger.pruneOldLogs(supabase);
        if (prunedCount > 0) {
            console.log(`[cron] Pruned ${prunedCount} old pipeline log(s)`);
        }

        // 5. Execute search
        const result = await executeJobSearch(undefined, supabase);

        // 6. Persist pipeline logs to Supabase Storage
        await result.logger.persist(supabase);

        return NextResponse.json({
            success: true,
            triggered_at: new Date().toISOString(),
            new_jobs_found: result.new_jobs_found,
            resumes_searched: result.resumes_searched,
            backup: {
                rows: backupResult.totalRows,
                size_kb: Math.round(backupResult.sizeBytes / 1024),
                error: backupResult.error || null,
            },
        });
    } catch (error) {
        console.error("Cron job error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Cron job failed" },
            { status: 500 }
        );
    }
}
