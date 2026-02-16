import { NextResponse } from "next/server";
import { executeJobSearch } from "@/lib/search/execute";

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

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Execute search directly (no HTTP round-trip needed)
        const result = await executeJobSearch();

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
