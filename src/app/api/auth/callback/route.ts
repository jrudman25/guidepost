import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Keep redirects same-origin: "//x" and "/\x" normalize to protocol-relative
// URLs, and anything not starting with "/" could rehost the redirect.
function safeNextPath(next: string | null): string {
    if (next?.startsWith("/") && next[1] !== "/" && next[1] !== "\\") {
        return next;
    }
    return "/";
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = safeNextPath(searchParams.get("next"));

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`);
        }
    }

    // If something went wrong, redirect to login with error
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
