import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "pipeline-logs";

/**
 * GET /api/logs
 * List available pipeline log files.
 */
export async function GET() {
    try {
        const supabase = await createClient();

        // Only allow non-demo users to view pipeline logs
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email === "demo@guidepostai.app") {
            return NextResponse.json({ error: "Not available" }, { status: 403 });
        }

        const { data: files, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .list("", { limit: 100, sortBy: { column: "name", order: "desc" } });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const logs = (files || [])
            .filter((f) => f.name.endsWith(".md"))
            .map((f) => ({
                date: f.name.replace(".md", ""),
                filename: f.name,
                size: f.metadata?.size || 0,
            }));

        return NextResponse.json({ logs });
    } catch (error) {
        console.error("List logs error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
