import { NextResponse } from "next/server";
import { executeJobSearch } from "@/lib/search/execute";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/jobs/search
 * Trigger a job search for a specific resume (or all active resumes).
 * Body: { resume_id?: string }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const resumeId = body.resume_id as string | undefined;

        const supabase = await createClient();
        const result = await executeJobSearch(resumeId, supabase);

        // Persist pipeline logs (manual searches get logged too)
        await result.logger.persist(supabase);

        return NextResponse.json({
            success: true,
            new_jobs_found: result.new_jobs_found,
            resumes_searched: result.resumes_searched,
        });
    } catch (error) {
        console.error("Job search error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
