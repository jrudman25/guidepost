import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeJobTitles } from "@/lib/job-titles-input";
import type { ParsedResumeData } from "@/lib/types";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const body = await request.json();

        const updates: Record<string, unknown> = {};

        if (body.is_active !== undefined) {
            if (typeof body.is_active !== "boolean") {
                return NextResponse.json(
                    { error: "is_active must be a boolean" },
                    { status: 400 }
                );
            }
            updates.is_active = body.is_active;
        }

        if (body.job_titles !== undefined) {
            const result = normalizeJobTitles(body.job_titles);
            if ("error" in result) {
                return NextResponse.json({ error: result.error }, { status: 400 });
            }

            const { data: existing, error: fetchError } = await supabase
                .from("resumes")
                .select("parsed_data")
                .eq("id", id)
                .single();

            if (fetchError) {
                return NextResponse.json({ error: fetchError.message }, { status: 500 });
            }
            if (!existing?.parsed_data) {
                return NextResponse.json(
                    { error: "Cannot update job titles: resume has no parsed data" },
                    { status: 400 }
                );
            }

            updates.parsed_data = {
                ...(existing.parsed_data as ParsedResumeData),
                job_titles: result.titles,
            };
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                { error: "No valid fields to update" },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from("resumes")
            .update(updates)
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
            const { error: storageError } = await supabase.storage
                .from("resumes")
                .remove([resume.file_path]);
            if (storageError) {
                console.error("Storage delete error:", storageError);
                // Continue — still delete the DB record even if storage fails
            }
        }

        // Delete from database
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

