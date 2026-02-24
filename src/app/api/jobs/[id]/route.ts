import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/jobs/[id]
 * Update a job listing's status and/or seen_at timestamp.
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const body = await request.json();

        // Build update object from provided fields
        const updates: Record<string, unknown> = {};
        if (body.status !== undefined) {
            const validStatuses = ["new", "saved", "dismissed", "applied"];
            if (!validStatuses.includes(body.status)) {
                return NextResponse.json(
                    { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
                    { status: 400 }
                );
            }
            updates.status = body.status;
        }
        if (body.seen_at !== undefined) updates.seen_at = body.seen_at;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                { error: "No fields to update" },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from("job_listings")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ job: data });
    } catch (error) {
        console.error("Update job error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

