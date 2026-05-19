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
    const logger = new PipelineLogger();
    let supabase: ReturnType<typeof createServiceClient> | undefined;

    try {
        // Verify cron secret to prevent unauthorized calls
        const authHeader = request.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        logger.info("cron", "Daily search cron started");

        // Use service role client (bypasses RLS since cron has no user session)
        supabase = createServiceClient();
        await logger.persist(supabase);

        // 1. Daily database backup (run first so data is captured even if search fails)
        logger.info("backup", "Starting database backup");
        const backupResult = await createBackup(supabase);
        if (backupResult.error) {
            logger.warn("backup", backupResult.error);
        } else {
            logger.info("backup", `Backed up ${backupResult.totalRows} rows`);
        }

        // 2. Prune old backups (older than 30 days)
        const prunedBackups = await pruneOldBackups(supabase);
        if (prunedBackups > 0) {
            logger.info("backup", `Pruned ${prunedBackups} old backup(s)`);
        }
        await logger.persist(supabase);

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
            logger.warn("cleanup", `Failed to cleanup old dismissed jobs: ${cleanupError.message}`);
        } else {
            logger.info("cleanup", "Cleaned up old dismissed jobs");
        }
        await logger.persist(supabase);

        // 4. Prune old pipeline logs (older than 14 days)
        const prunedCount = await PipelineLogger.pruneOldLogs(supabase);
        if (prunedCount > 0) {
            console.log(`[cron] Pruned ${prunedCount} old pipeline log(s)`);
        }

        // 5. Look up demo account to exclude from search (saves API usage)
        logger.info("setup", "Looking up demo account exclusion");
        let demoUserId: string | undefined;
        const { data: demoUsers } = await supabase.auth.admin.listUsers();
        const demoUser = demoUsers?.users?.find((u) => u.email === "demo@guidepostai.app");
        if (demoUser) {
            demoUserId = demoUser.id;
            logger.info("setup", "Demo account excluded from cron search");
        }
        await logger.persist(supabase);

        // 6. Execute search (excluding demo account)
        const result = await executeJobSearch(undefined, supabase, demoUserId, logger);
        logger.info("cron", "Daily search cron completed");

        // 7. Persist pipeline logs to Supabase Storage
        await logger.persist(supabase);

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
        logger.error("cron", `Cron job failed: ${error instanceof Error ? error.message : String(error)}`);
        if (supabase) {
            await logger.persist(supabase);
        }
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Cron job failed" },
            { status: 500 }
        );
    }
}
