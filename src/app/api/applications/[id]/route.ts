import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/applications/[id]
 * Update an application (status, notes, etc.)
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const body = await request.json();

        // Note: status_updated_at and status_history are managed by a DB trigger
        // (log_application_status_change) so we only need to set the new status.
        const updateData: Record<string, unknown> = {};
        if (body.status !== undefined) updateData.status = body.status;
        if (body.notes !== undefined) updateData.notes = body.notes;
        if (body.applied_via !== undefined) updateData.applied_via = body.applied_via;
        if (body.url !== undefined) updateData.url = body.url;
        if (body.job_title !== undefined) updateData.job_title = body.job_title;
        if (body.company !== undefined) updateData.company = body.company;
        if (body.applied_at !== undefined) updateData.applied_at = body.applied_at;
        if (body.heard_back_at !== undefined) updateData.heard_back_at = body.heard_back_at;

        const { data, error } = await supabase
            .from("applications")
            .update(updateData)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ application: data });
    } catch (error) {
        console.error("Update application error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/applications/[id]
 */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { error } = await supabase
            .from("applications")
            .delete()
            .eq("id", id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete application error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}


