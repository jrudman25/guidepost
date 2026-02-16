import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/resumes/[id]/filters
 * Get search filters for a specific resume.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("search_filters")
            .select("*")
            .eq("resume_id", id)
            .single();

        if (error && error.code !== "PGRST116") {
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
 * PUT /api/resumes/[id]/filters
 * Create or update search filters for a specific resume.
 */
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const body = await request.json();

        // Check if filters already exist
        const { data: existing } = await supabase
            .from("search_filters")
            .select("id")
            .eq("resume_id", id)
            .single();

        const filterData = {
            resume_id: id,
            keywords: body.keywords || [],
            location: body.location || null,
            remote_preference: body.remote_preference || "any",
            min_salary: body.min_salary || null,
            max_listing_age_days: body.max_listing_age_days || 7,
            excluded_companies: body.excluded_companies || [],
        };

        let result;
        if (existing) {
            result = await supabase
                .from("search_filters")
                .update(filterData)
                .eq("resume_id", id)
                .select()
                .single();
        } else {
            result = await supabase
                .from("search_filters")
                .insert(filterData)
                .select()
                .single();
        }

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
