import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/jobs/bulk
 * Update multiple job listings' status at once.
 * Body: { ids: string[], status: string }
 */
export async function PATCH(request: Request) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        const { ids, status } = body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json(
                { error: "ids array is required" },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from("job_listings")
            .update({ status })
            .in("id", ids);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, updated: ids.length });
    } catch (error) {
        console.error("Bulk update jobs error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
