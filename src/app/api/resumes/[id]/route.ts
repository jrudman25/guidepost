import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const body = await request.json();

        const { data, error } = await supabase
            .from("resumes")
            .update({ is_active: body.is_active })
            .eq("id", id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ resume: data });
    } catch (error) {
        console.error("Update resume error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        // Get the file path first so we can delete from storage
        const { data: resume, error: fetchError } = await supabase
            .from("resumes")
            .select("file_path")
            .eq("id", id)
            .single();

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        // Delete from storage
        if (resume?.file_path) {
            await supabase.storage.from("resumes").remove([resume.file_path]);
        }

        // Delete from database (cascades to search_filters)
        const { error: deleteError } = await supabase
            .from("resumes")
            .delete()
            .eq("id", id);

        if (deleteError) {
            return NextResponse.json(
                { error: deleteError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete resume error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
