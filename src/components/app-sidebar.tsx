"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
    LayoutDashboard,
    FileText,
    Inbox,
    ClipboardList,
    Compass,
    LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Resumes", href: "/resumes", icon: FileText },
    { name: "Job Inbox", href: "/inbox", icon: Inbox },
    { name: "Applications", href: "/applications", icon: ClipboardList },
];

export function AppSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [unseenCount, setUnseenCount] = useState(0);

    const fetchUnseenCount = useCallback(async () => {
        try {
            const res = await fetch("/api/jobs/unseen-count");
            if (res.ok) {
                const data = await res.json();
                setUnseenCount(data.count ?? 0);
            }
        } catch {
            // Silently fail - non-critical
        }
    }, []);

    useEffect(() => {
        fetchUnseenCount();
        const interval = setInterval(fetchUnseenCount, 60_000);
        return () => clearInterval(interval);
    }, [fetchUnseenCount]);

    async function handleLogout() {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
    }

    return (
        <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card">
            {/* Logo */}
            <div className="flex h-16 items-center gap-2 border-b border-border px-6">
                <Compass className="h-6 w-6 text-primary" />
                <span className="text-lg font-semibold tracking-tight">Guidepost</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 px-3 py-4">
                {navigation.map((item) => {
                    const isActive =
                        item.href === "/"
                            ? pathname === "/"
                            : pathname.startsWith(item.href);

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.name}
                            {item.name === "Job Inbox" && unseenCount > 0 && (
                                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-semibold text-white">
                                    {unseenCount > 99 ? "99+" : unseenCount}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="border-t border-border px-3 py-3">
                <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    <LogOut className="h-4 w-4" />
                    Log Out
                </button>
                <p className="mt-2 px-3 text-xs text-muted-foreground">
                    Guidepost v0.4.2
                </p>
            </div>
        </aside>
    );
}
