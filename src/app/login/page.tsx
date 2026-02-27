"use client";

import { useState } from "react";
import { Compass, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [guestLoading, setGuestLoading] = useState(false);
    const [sent, setSent] = useState(false);

    async function handleGuestLogin() {
        setGuestLoading(true);
        const supabase = createClient();

        const { error } = await supabase.auth.signInWithPassword({
            email: "demo@guidepostai.app",
            password: "demo123",
        });

        if (error) {
            setGuestLoading(false);
            toast.error("Failed to sign in as guest", {
                description: error.message,
            });
            return;
        }

        // Redirect to dashboard (middleware will handle session refresh)
        window.location.href = "/";
    }

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);

        const supabase = createClient();
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${window.location.origin}/api/auth/callback`,
            },
        });

        setLoading(false);

        if (error) {
            toast.error("Failed to send magic link", {
                description: error.message,
            });
            return;
        }

        setSent(true);
        toast.success("Magic link sent! Check your email.");
    }

    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="w-full max-w-sm space-y-8">
                {/* Logo */}
                <div className="flex flex-col items-center gap-2">
                    <Compass className="h-10 w-10 text-primary" />
                    <h1 className="text-2xl font-bold tracking-tight">Guidepost</h1>
                    <p className="text-sm text-muted-foreground">
                        Your job search command center
                    </p>
                </div>

                {sent ? (
                    <div className="rounded-xl border border-border bg-card p-6 text-center">
                        <h2 className="text-lg font-semibold">Check your email</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            We sent a magic link to <strong>{email}</strong>. Click the link
                            to sign in.
                        </p>
                        <Button
                            variant="ghost"
                            className="mt-4"
                            onClick={() => setSent(false)}
                        >
                            Use a different email
                        </Button>
                    </div>
                ) : (
                    <form
                        onSubmit={handleLogin}
                        className="rounded-xl border border-border bg-card p-6 space-y-4"
                    >
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading || guestLoading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Send magic link
                        </Button>
                        <div className="relative my-4">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-border" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-card px-2 text-muted-foreground">
                                    Or
                                </span>
                            </div>
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            disabled={loading || guestLoading}
                            onClick={handleGuestLogin}
                        >
                            {guestLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Sign in as Guest
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
}
