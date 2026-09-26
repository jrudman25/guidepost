import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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

        // Log files are named YYYY-MM-DD.md — reject anything else (path traversal, junk)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
        }

        const supabase = await createClient();

        // Only allow non-demo users to view pipeline logs
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email === "demo@guidepostai.app") {
            return NextResponse.json({ error: "Not available" }, { status: 403 });
        }

        const filePath = `${date}.md`;

        // pipeline-logs is service-role-only at the storage layer; access is
        // gated by the auth checks above.
        const service = createServiceClient();
        const { data, error } = await service.storage
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
