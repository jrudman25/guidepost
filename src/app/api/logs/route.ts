import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canViewPipelineLogs } from "@/lib/log-access";

const STORAGE_BUCKET = "pipeline-logs";

/**
 * GET /api/logs
 * List available pipeline log files.
 */
export async function GET() {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!canViewPipelineLogs(user?.email)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // pipeline-logs is service-role-only at the storage layer; access is
        // gated here instead (the configured log administrator only).
        const service = createServiceClient();
        const { data: files, error } = await service.storage
            .from(STORAGE_BUCKET)
            .list("", { limit: 100, sortBy: { column: "name", order: "desc" } });

        if (error) {
            return NextResponse.json({ error: "Failed to read pipeline logs" }, { status: 500 });
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
