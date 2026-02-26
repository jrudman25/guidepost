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
    const [inboxTotal, setInboxTotal] = useState(0);

    const fetchCounts = useCallback(async () => {
        try {
            const res = await fetch("/api/jobs/unseen-count");
            if (res.ok) {
                const data = await res.json();
                setUnseenCount(data.count ?? 0);
                setInboxTotal(data.totalNew ?? 0);
            }
        } catch {
            // Silently fail - non-critical
        }
    }, []);

    useEffect(() => {
        fetchCounts();
        const interval = setInterval(fetchCounts, 300_000); // 5 min — only needed for cron-discovered jobs

        // Listen for immediate updates from the inbox page
        const handleUnseenUpdate = (e: Event) => {
            const delta = (e as CustomEvent<number>).detail;
            if (typeof delta === "number") {
                setUnseenCount((prev) => Math.max(0, prev + delta));
            } else {
                fetchCounts();
            }
        };
        const handleTotalUpdate = (e: Event) => {
            const delta = (e as CustomEvent<number>).detail;
            if (typeof delta === "number") {
                setInboxTotal((prev) => Math.max(0, prev + delta));
            } else {
                fetchCounts();
            }
        };

        window.addEventListener("unseenCountChanged", handleUnseenUpdate);
        window.addEventListener("inboxTotalChanged", handleTotalUpdate);

        return () => {
            clearInterval(interval);
            window.removeEventListener("unseenCountChanged", handleUnseenUpdate);
            window.removeEventListener("inboxTotalChanged", handleTotalUpdate);
        };
    }, [fetchCounts]);

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
                            {item.name === "Job Inbox" && (
                                <div className="ml-auto flex items-center gap-1.5">
                                    {unseenCount > 0 && (
                                        <span
                                            className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white leading-none"
                                            title={`${unseenCount} unseen jobs`}
                                        >
                                            {unseenCount > 99 ? "99+" : unseenCount}
                                        </span>
                                    )}
                                    {inboxTotal > 0 && (
                                        <span
                                            className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium leading-none"
                                            title={`${inboxTotal} total jobs in inbox`}
                                        >
                                            {inboxTotal > 99 ? "99+" : inboxTotal}
                                        </span>
                                    )}
                                </div>
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
                    Guidepost v0.4.4
                </p>
            </div>
        </aside>
    );
}
