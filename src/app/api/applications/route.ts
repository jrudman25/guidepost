import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/applications
 * List all applications with optional status filter.
 */
export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status");
        const limit = parseInt(searchParams.get("limit") || "20");
        const offset = parseInt(searchParams.get("offset") || "0");

        let query = supabase
            .from("applications")
            .select("*", { count: "exact" })
            .order("applied_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) {
            query = query.eq("status", status);
        }

        const search = searchParams.get("search");
        if (search) {
            query = query.or(`job_title.ilike.%${search}%,company.ilike.%${search}%,notes.ilike.%${search}%`);
        }

        const { data, count, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ applications: data, total: count });
    } catch (error) {
        console.error("Fetch applications error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/applications
 * Create a new application.
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        // Validate dates
        const appliedAt = body.applied_at || new Date().toISOString().split("T")[0];
        const today = new Date().toISOString().split("T")[0];
        if (appliedAt > today) {
            return NextResponse.json(
                { error: "Applied date cannot be in the future" },
                { status: 400 }
            );
        }
        if (body.heard_back_at && body.heard_back_at < appliedAt) {
            return NextResponse.json(
                { error: "Heard back date cannot be before the applied date" },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from("applications")
            .insert({
                job_listing_id: body.job_listing_id || null,
                job_title: body.job_title,
                company: body.company,
                applied_at: appliedAt,
                applied_via: body.applied_via || null,
                status: body.status || "applied",
                notes: body.notes || null,
                url: body.url || null,
                heard_back_at: body.heard_back_at || null,
                furthest_stage: body.furthest_stage || "applied",
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Log initial status in status_history
        await supabase.from("status_history").insert({
            application_id: data.id,
            from_status: null,
            to_status: data.status,
        });

        return NextResponse.json({ application: data }, { status: 201 });
    } catch (error) {
        console.error("Create application error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
