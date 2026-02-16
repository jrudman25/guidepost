"use client";

import { useState, useEffect, useMemo } from "react";
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

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
                    value={stats.avgDaysToHearBack || "—"}
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
                            Manage resumes →
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
                    <div>
                        <p className="font-semibold">Job Inbox</p>
                        <p className="text-sm text-muted-foreground">
                            {stats.newJobsThisWeek} new listings this week
                        </p>
                    </div>
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
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis
                                    dataKey="week"
                                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                                />
                                <YAxis
                                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                                    allowDecimals={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "hsl(var(--card))",
                                        border: "1px solid hsl(var(--border))",
                                        borderRadius: "8px",
                                        color: "hsl(var(--foreground))",
                                    }}
                                />
                                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
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
                                            backgroundColor: "hsl(var(--card))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: "8px",
                                            color: "hsl(var(--foreground))",
                                        }}
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
