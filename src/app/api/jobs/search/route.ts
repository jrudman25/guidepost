import { NextResponse } from "next/server";
import { executeJobSearch } from "@/lib/search/execute";

/**
 * POST /api/jobs/search
 * Trigger a job search for a specific resume (or all active resumes).
 * Body: { resume_id?: string }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const resumeId = body.resume_id as string | undefined;

        const result = await executeJobSearch(resumeId);

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error("Job search error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
