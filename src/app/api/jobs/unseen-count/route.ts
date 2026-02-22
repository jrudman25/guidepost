import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/jobs/unseen-count
 * Returns the count of job listings that haven't been seen yet (seen_at IS NULL, status = 'new').
 */
export async function GET() {
    try {
        const supabase = await createClient();

        const { count, error } = await supabase
            .from("job_listings")
            .select("*", { count: "exact", head: true })
            .is("seen_at", null)
            .eq("status", "new");

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ count: count ?? 0 });
    } catch (error) {
        console.error("Unseen count error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
