import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
    try {
        const supabase = await createClient();

        const { data: resumes, error } = await supabase
            .from("resumes")
            .select("*")
            .order("uploaded_at", { ascending: false });

        if (error) {
            console.error("Fetch resumes query error:", error);
            return NextResponse.json(
                { error: "Failed to load resumes" },
                { status: 500 }
            );
        }

        return NextResponse.json({ resumes });
    } catch (error) {
        console.error("Fetch resumes error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
