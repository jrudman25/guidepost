"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
    Loader2,
    TrendingUp,
    Mail,
    Clock,
    FileText,
    Inbox,
    BarChart3,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from "recharts";

interface Stats {
    applicationsThisWeek: number;
    applicationsThisMonth: number;
    responseRate: number;
    avgDaysToHearBack: number;
    statusBreakdown: Record<string, number>;
    weeklyApplications: { week: string; count: number }[];
    activeResumes: number;
    newJobsThisWeek: number;
    resumeSkills: string[];
    totalApplications: number;
}

const STATUS_COLORS: Record<string, string> = {
    applied: "#3b82f6",
    screening: "#f59e0b",
    interview: "#8b5cf6",
    offer: "#10b981",
    rejected: "#ef4444",
    ghosted: "#71717a",
};

const STATUS_LABELS: Record<string, string> = {
    applied: "Applied",
    screening: "Screening",
    interview: "Interview",
    offer: "Offer",
    rejected: "Rejected",
    ghosted: "Ghosted",
};

// Dark-mode friendly colors for Recharts (SVG doesn't resolve CSS vars)
const CHART_COLORS = {
    text: "#a1a1aa",       // zinc-400
    grid: "#27272a",       // zinc-800
    bar: "#6366f1",        // indigo-500 (primary)
    tooltipBg: "#18181b",  // zinc-900
    tooltipBorder: "#3f3f46", // zinc-700
    tooltipText: "#fafafa",   // zinc-50
    cursorFill: "rgba(161, 161, 170, 0.1)",
};

export default function DashboardPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    }, []);

    useEffect(() => {
        async function fetchStats() {
            try {
                const response = await fetch("/api/stats");
                const data = await response.json();
                setStats(data);
            } catch (error) {
                console.error("Failed to fetch stats:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchStats();
    }, []);

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
        } catch { }
    }, []);

    useEffect(() => {
        fetchCounts();
    }, [fetchCounts]);

    if (loading) {
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div>
                    <Skeleton className="h-9 w-64" />
                    <Skeleton className="mt-2 h-5 w-48" />
                </div>

                {/* Key metrics skeleton */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="rounded-xl border border-border bg-card p-6">
                            <div className="flex items-center gap-2 mb-2">
                                <Skeleton className="h-4 w-4 rounded-full" />
                                <Skeleton className="h-4 w-24" />
                            </div>
                            <Skeleton className="mt-4 h-8 w-16" />
                            <Skeleton className="mt-2 h-3 w-32" />
                        </div>
                    ))}
                </div>

                {/* Quick links skeleton */}
                <div className="grid gap-4 md:grid-cols-2">
                    {[1, 2].map((i) => (
                        <div key={i} className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
                            <Skeleton className="h-8 w-8 rounded-full" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-5 w-24" />
                                <Skeleton className="h-4 w-40" />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Charts row skeleton */}
                <div className="grid gap-6 lg:grid-cols-2">
                    {[1, 2].map((i) => (
                        <div key={i} className="rounded-xl border border-border bg-card p-6 h-[330px]">
                            <Skeleton className="h-6 w-48 mb-6" />
                            <Skeleton className="h-full w-full rounded-md" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="py-12 text-center text-muted-foreground">
                Failed to load dashboard data.
            </div>
        );
    }

    const pieData = Object.entries(stats.statusBreakdown)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
            name: STATUS_LABELS[status] || status,
            value: count,
            color: STATUS_COLORS[status] || "#71717a",
        }));

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">
                    {greeting}, Jordan
                </h1>
                <p className="mt-1 text-muted-foreground">
                    Your job search at a glance.
                </p>
            </div>

            {/* Key metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                    icon={TrendingUp}
                    label="Applications This Week"
                    value={stats.applicationsThisWeek}
                    subtext={`${stats.applicationsThisMonth} this month`}
                />
                <MetricCard
                    icon={Mail}
                    label="Response Rate"
                    value={`${stats.responseRate}%`}
                    subtext={`of ${stats.totalApplications} total`}
                />
                <MetricCard
                    icon={Clock}
                    label="Avg. Days to Hear Back"
                    value={stats.avgDaysToHearBack || "\u2014"}
                    subtext="from application date"
                />
                <MetricCard
                    icon={FileText}
                    label="Active Resumes"
                    value={stats.activeResumes}
                    subtext={
                        <Link
                            href="/resumes"
                            className="text-primary hover:underline"
                        >
                            Manage resumes {"\u2192"}
                        </Link>
                    }
                />
            </div>

            {/* Quick links */}
            <div className="grid gap-4 md:grid-cols-2">
                <Link
                    href="/inbox"
                    className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
                >
                    <Inbox className="h-8 w-8 text-primary" />
                    <div className="flex-1">
                        <p className="font-semibold">Job Inbox</p>
                        <p className="text-sm text-muted-foreground">
                            {inboxTotal} jobs to review • {stats.newJobsThisWeek} new this week
                        </p>
                    </div>
                    {unseenCount > 0 && (
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-500 px-2 text-xs font-semibold text-white">
                            {unseenCount > 99 ? "99+" : unseenCount} unseen
                        </span>
                    )}
                </Link>
                <Link
                    href="/applications"
                    className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
                >
                    <BarChart3 className="h-8 w-8 text-primary" />
                    <div>
                        <p className="font-semibold">Applications</p>
                        <p className="text-sm text-muted-foreground">
                            {stats.totalApplications} total tracked
                        </p>
                    </div>
                </Link>
            </div>

            {/* Charts row */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Weekly applications chart */}
                <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-4 font-semibold">Applications Over Time</h3>
                    {stats.weeklyApplications.some((w) => w.count > 0) ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={stats.weeklyApplications}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                                <XAxis
                                    dataKey="week"
                                    tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                                    stroke={CHART_COLORS.grid}
                                />
                                <YAxis
                                    tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                                    stroke={CHART_COLORS.grid}
                                    allowDecimals={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: CHART_COLORS.tooltipBg,
                                        border: `1px solid ${CHART_COLORS.tooltipBorder}`,
                                        borderRadius: "8px",
                                        color: CHART_COLORS.tooltipText,
                                    }}
                                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                                    itemStyle={{ color: CHART_COLORS.tooltipText }}
                                    cursor={{ fill: CHART_COLORS.cursorFill }}
                                />
                                <Bar dataKey="count" fill={CHART_COLORS.bar} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                            No application data yet
                        </div>
                    )}
                </div>

                {/* Status breakdown */}
                <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-4 font-semibold">Status Breakdown</h3>
                    {pieData.length > 0 ? (
                        <div className="flex items-center gap-6">
                            <ResponsiveContainer width="50%" height={250}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={90}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={index} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: CHART_COLORS.tooltipBg,
                                            border: `1px solid ${CHART_COLORS.tooltipBorder}`,
                                            borderRadius: "8px",
                                            color: CHART_COLORS.tooltipText,
                                        }}
                                        labelStyle={{ color: CHART_COLORS.tooltipText }}
                                        itemStyle={{ color: CHART_COLORS.tooltipText }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="space-y-2">
                                {pieData.map((entry) => (
                                    <div key={entry.name} className="flex items-center gap-2 text-sm">
                                        <div
                                            className="h-3 w-3 rounded-full"
                                            style={{ backgroundColor: entry.color }}
                                        />
                                        <span className="text-muted-foreground">{entry.name}</span>
                                        <span className="font-semibold">{entry.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                            No application data yet
                        </div>
                    )}
                </div>
            </div>

            {/* Resume skills */}
            {stats.resumeSkills.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-3 font-semibold">Your Skills Profile</h3>
                    <p className="mb-3 text-sm text-muted-foreground">
                        Skills extracted from your active resumes
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {stats.resumeSkills.map((skill) => (
                            <span
                                key={skill}
                                className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
                            >
                                {skill}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function MetricCard({
    icon: Icon,
    label,
    value,
    subtext,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string | number;
    subtext?: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{label}</p>
            </div>
            <p className="mt-2 text-3xl font-bold">{value}</p>
            {subtext && (
                <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
            )}
        </div>
    );
}
