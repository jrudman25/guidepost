import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseResume } from "@/lib/resume-parser";

export async function POST(request: Request) {
    try {
        const supabase = await createClient();

        // Get the uploaded file from form data
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (file.type !== "application/pdf") {
            return NextResponse.json(
                { error: "Only PDF files are supported" },
                { status: 400 }
            );
        }

        // Enforce 10MB file size limit
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "File size exceeds the 10MB limit" },
                { status: 400 }
            );
        }

        // Sanitize filename and build storage path (prefixed by user id so
        // storage policies can scope object access per user)
        const { data: { user } } = await supabase.auth.getUser();
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${user?.id ?? "unknown"}/${timestamp}_${safeName}`;

        const { error: uploadError } = await supabase.storage
            .from("resumes")
            .upload(filePath, file, {
                contentType: "application/pdf",
                upsert: false,
            });

        if (uploadError) {
            console.error("Upload error:", uploadError);
            return NextResponse.json(
                { error: "Failed to upload file: " + uploadError.message },
                { status: 500 }
            );
        }

        // Extract text from PDF
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buffer: Buffer) => Promise<{ text: string }>;
        const pdfData = await pdfParse(buffer);
        const resumeText = pdfData.text;

        if (!resumeText || resumeText.trim().length < 50) {
            await supabase.storage.from("resumes").remove([filePath]);
            return NextResponse.json(
                { error: "Could not extract enough text from the PDF. The file may be image-based or too short." },
                { status: 400 }
            );
        }

        // Parse with Gemini
        let parsedData;
        try {
            parsedData = await parseResume(resumeText);
        } catch (parseErr) {
            await supabase.storage.from("resumes").remove([filePath]);
            throw parseErr;
        }

        // Insert resume record
        const { data: resume, error: insertError } = await supabase
            .from("resumes")
            .insert({
                file_path: filePath,
                file_name: file.name,
                parsed_data: parsedData,
                is_active: true,
            })
            .select()
            .single();

        if (insertError) {
            console.error("Insert error:", insertError);
            await supabase.storage.from("resumes").remove([filePath]);
            return NextResponse.json(
                { error: "Failed to save resume: " + insertError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ resume }, { status: 201 });
    } catch (error) {
        console.error("Resume upload error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
