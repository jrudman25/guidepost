import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "pipeline-logs";

/**
 * GET /api/logs/[date]
 * Fetch the contents of a specific pipeline log file by date (YYYY-MM-DD).
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ date: string }> }
) {
    try {
        const { date } = await params;
        const supabase = await createClient();

        // Only allow non-demo users to view pipeline logs
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email === "demo@guidepostai.app") {
            return NextResponse.json({ error: "Not available" }, { status: 403 });
        }

        const filePath = `${date}.md`;

        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .download(filePath);

        if (error) {
            return NextResponse.json(
                { error: "Log file not found" },
                { status: 404 }
            );
        }

        const content = await data.text();

        return NextResponse.json({ date, content });
    } catch (error) {
        console.error("Fetch log error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
