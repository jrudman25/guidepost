import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseResume } from "@/lib/resume-parser";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_REQUEST_SIZE = 4_500_000;
const MAX_PDF_PAGES = 30;
const MAX_RESUME_TEXT_LENGTH = 40_000;

export async function POST(request: Request) {
    let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
    let uploadedFilePath: string | null = null;

    try {
        supabase = await createClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const contentLength = request.headers.get("content-length");
        if (contentLength) {
            const requestSize = Number(contentLength);
            if (!Number.isFinite(requestSize) || requestSize < 0) {
                return NextResponse.json({ error: "Invalid Content-Length" }, { status: 400 });
            }
            if (requestSize > MAX_REQUEST_SIZE) {
                return NextResponse.json({ error: "Request is too large" }, { status: 413 });
            }
        }

        // Get the uploaded file from form data
        const formData = await request.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (file.type !== "application/pdf") {
            return NextResponse.json(
                { error: "Only PDF files are supported" },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "File size exceeds the 4MB limit" },
                { status: 413 }
            );
        }

        const signature = Buffer.from(await file.slice(0, 5).arrayBuffer()).toString("ascii");
        if (signature !== "%PDF-") {
            return NextResponse.json({ error: "The uploaded file is not a valid PDF" }, { status: 400 });
        }

        // Parse the PDF before storing it. Keep PDF.js eval support disabled,
        // cap page and text processing, and always release parser resources.
        let resumeText: string;
        const parser = new PDFParse({
            data: new Uint8Array(await file.arrayBuffer()),
            isEvalSupported: false,
        });
        try {
            const pdfData = await parser.getText({ first: MAX_PDF_PAGES });
            resumeText = pdfData.text.slice(0, MAX_RESUME_TEXT_LENGTH);
        } finally {
            await parser.destroy();
        }

        if (!resumeText || resumeText.trim().length < 50) {
            return NextResponse.json(
                { error: "Could not extract enough text from the PDF. The file may be image-based or too short." },
                { status: 400 }
            );
        }

        // Parse with Gemini
        const parsedData = await parseResume(resumeText);

        // Store under the authenticated user's folder so Storage RLS keeps
        // each resume private to its owner.
        const safeName = (file.name || "resume.pdf")
            .replace(/[^a-zA-Z0-9._-]/g, "_")
            .slice(0, 120);
        const filePath = `${user.id}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage
            .from("resumes")
            .upload(filePath, file, {
                contentType: "application/pdf",
                upsert: false,
            });

        if (uploadError) {
            console.error("Resume upload storage error:", uploadError);
            return NextResponse.json({ error: "Failed to store the resume" }, { status: 500 });
        }
        uploadedFilePath = filePath;

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
            uploadedFilePath = null;
            return NextResponse.json(
                { error: "Failed to save the resume" },
                { status: 500 }
            );
        }

        uploadedFilePath = null;
        return NextResponse.json({ resume }, { status: 201 });
    } catch (error) {
        console.error("Resume upload error:", error);
        if (supabase && uploadedFilePath) {
            try {
                await supabase.storage.from("resumes").remove([uploadedFilePath]);
            } catch (cleanupError) {
                console.error("Resume storage cleanup error:", cleanupError);
            }
        }
        return NextResponse.json(
            { error: "Failed to process the resume" },
            { status: 500 }
        );
    }
}
