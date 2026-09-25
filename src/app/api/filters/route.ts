import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSearchFilterInput } from "@/lib/search-filter-input";

/**
 * GET /api/filters
 * Get the current user's search filters (shared across all active resumes).
 */
export async function GET() {
    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("search_filters")
            .select("*")
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ filters: data });
    } catch (error) {
        console.error("Fetch filters error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/filters
 * Create or update the current user's search filters.
 */
export async function PUT(request: Request) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        const parsed = parseSearchFilterInput(body);
        if ("error" in parsed) {
            return NextResponse.json({ error: parsed.error }, { status: 400 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const result = await supabase
            .from("search_filters")
            .upsert(
                { ...parsed.data, user_id: user.id },
                { onConflict: "user_id" }
            )
            .select()
            .single();

        if (result.error) {
            return NextResponse.json(
                { error: result.error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ filters: result.data });
    } catch (error) {
        console.error("Update filters error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
