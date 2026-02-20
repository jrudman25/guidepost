"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { JobListing } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Loader2,
    Search,
    ExternalLink,
    Bookmark,
    X as XIcon,
    CheckCircle,
    MapPin,
    Building2,
    Wifi,
    DollarSign,
    Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function getScoreColor(score: number | null): string {
    if (!score) return "bg-muted text-muted-foreground";
    if (score >= 80) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    if (score >= 60) return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    if (score >= 40) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    return "bg-red-500/15 text-red-400 border-red-500/30";
}

export default function InboxPage() {
    const [jobs, setJobs] = useState<JobListing[]>([]);
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [activeTab, setActiveTab] = useState("new");
    const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);

    const fetchJobs = useCallback(async (status?: string) => {
        try {
            const url = status ? `/api/jobs?status=${status}` : "/api/jobs";
            const response = await fetch(url);
            const data = await response.json();
            setJobs(data.jobs || []);
        } catch (error) {
            console.error("Failed to fetch jobs:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchJobs(activeTab === "all" ? undefined : activeTab);
    }, [activeTab, fetchJobs]);

    async function triggerSearch() {
        setSearching(true);
        try {
            const response = await fetch("/api/jobs/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error);

            toast.success(`Found ${data.new_jobs_found} new job listings!`);
            fetchJobs(activeTab === "all" ? undefined : activeTab);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Search failed"
            );
        } finally {
            setSearching(false);
        }
    }

    async function updateJobStatus(
        jobId: string,
        status: JobListing["status"]
    ) {
        try {
            const response = await fetch(`/api/jobs/${jobId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });

            if (!response.ok) throw new Error("Failed to update");

            // Update local state
            setJobs((prev) =>
                prev.map((j) => (j.id === jobId ? { ...j, status } : j))
            );

            if (selectedJob?.id === jobId) {
                setSelectedJob((prev) => (prev ? { ...prev, status } : null));
            }

            const labels: Record<string, string> = {
                saved: "Job saved",
                dismissed: "Job dismissed",
                applied: "Marked as applied",
            };
            toast.success(labels[status] || "Status updated");
        } catch {
            toast.error("Failed to update job status");
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Job Inbox</h1>
                    <p className="mt-1 text-muted-foreground">
                        Job listings matched to your resumes, scored by relevance.
                    </p>
                </div>
                <Button onClick={triggerSearch} disabled={searching}>
                    {searching ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Search className="mr-2 h-4 w-4" />
                    )}
                    {searching ? "Searching..." : "Search Now"}
                </Button>
            </div>

            {/* Scan timing info */}
            <ScanTimingInfo jobs={jobs} />

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="new">New</TabsTrigger>
                    <TabsTrigger value="saved">Saved</TabsTrigger>
                    <TabsTrigger value="applied">Applied</TabsTrigger>
                    <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
                    <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
            </Tabs>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : jobs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-12 text-center">
                    <p className="text-muted-foreground">
                        {activeTab === "new"
                            ? "No new job listings. Click 'Search Now' or wait for the daily scan."
                            : `No ${activeTab} listings.`}
                    </p>
                </div>
            ) : (
                <div className="flex gap-6">
                    {/* Job list */}
                    <div className="w-full space-y-3 lg:w-1/2">
                        {jobs.map((job) => (
                            <button
                                key={job.id}
                                onClick={() => setSelectedJob(job)}
                                className={cn(
                                    "w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50",
                                    selectedJob?.id === job.id && "border-primary ring-1 ring-primary"
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="truncate font-semibold">{job.title}</h3>
                                        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                                            <Building2 className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate">{job.company}</span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                            {job.location && (
                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <MapPin className="h-3 w-3" />
                                                    {job.location}
                                                </span>
                                            )}
                                            {job.is_remote && (
                                                <Badge variant="outline" className="text-xs">
                                                    <Wifi className="mr-1 h-3 w-3" />
                                                    Remote
                                                </Badge>
                                            )}
                                            {job.salary_info && (
                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <DollarSign className="h-3 w-3" />
                                                    {job.salary_info}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "shrink-0 text-sm font-bold",
                                            getScoreColor(job.match_score)
                                        )}
                                    >
                                        {job.match_score ?? "â€”"}
                                    </Badge>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Job detail panel */}
                    {selectedJob && (
                        <div className="hidden w-1/2 space-y-4 rounded-xl border border-border bg-card p-6 lg:block">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-xl font-bold">{selectedJob.title}</h2>
                                    <p className="mt-1 text-muted-foreground">
                                        {selectedJob.company}
                                    </p>
                                </div>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "text-lg font-bold",
                                        getScoreColor(selectedJob.match_score)
                                    )}
                                >
                                    {selectedJob.match_score ?? "â€”"}%
                                </Badge>
                            </div>

                            {/* Meta info */}
                            <div className="flex flex-wrap gap-2">
                                {selectedJob.location && (
                                    <Badge variant="secondary">
                                        <MapPin className="mr-1 h-3 w-3" />
                                        {selectedJob.location}
                                    </Badge>
                                )}
                                {selectedJob.is_remote && (
                                    <Badge variant="secondary">
                                        <Wifi className="mr-1 h-3 w-3" />
                                        Remote
                                    </Badge>
                                )}
                                {selectedJob.salary_info && (
                                    <Badge variant="secondary">
                                        <DollarSign className="mr-1 h-3 w-3" />
                                        {selectedJob.salary_info}
                                    </Badge>
                                )}
                            </div>

                            {/* Match reasoning */}
                            {selectedJob.match_reasoning && (
                                <div className="rounded-lg bg-muted/50 p-3">
                                    <p className="text-xs font-medium uppercase text-muted-foreground">
                                        Match Analysis
                                    </p>
                                    <p className="mt-1 text-sm">{selectedJob.match_reasoning}</p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2">
                                {selectedJob.status !== "saved" && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => updateJobStatus(selectedJob.id, "saved")}
                                    >
                                        <Bookmark className="mr-1 h-4 w-4" />
                                        Save
                                    </Button>
                                )}
                                {selectedJob.status !== "applied" && (
                                    <Button
                                        size="sm"
                                        onClick={() => updateJobStatus(selectedJob.id, "applied")}
                                    >
                                        <CheckCircle className="mr-1 h-4 w-4" />
                                        Mark Applied
                                    </Button>
                                )}
                                {selectedJob.status !== "dismissed" && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => updateJobStatus(selectedJob.id, "dismissed")}
                                    >
                                        <XIcon className="mr-1 h-4 w-4" />
                                        Dismiss
                                    </Button>
                                )}
                                {selectedJob.url && (
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href={selectedJob.url} target="_blank">
                                            <ExternalLink className="mr-1 h-4 w-4" />
                                            View Posting
                                        </Link>
                                    </Button>
                                )}
                            </div>

                            {/* Description */}
                            {selectedJob.description && (
                                <div className="max-h-96 overflow-y-auto">
                                    <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
                                        Job Description
                                    </p>
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                                        {selectedJob.description}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function getNextAutoScan(): Date {
    // Cron runs daily at 8 AM Pacific (UTC-8 in PST, UTC-7 in PDT)
    const now = new Date();
    // Get current time in Pacific
    const pacific = new Date(
        now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
    );
    const next = new Date(pacific);
    next.setHours(8, 0, 0, 0);

    // If 8 AM has already passed today, move to tomorrow
    if (next <= pacific) {
        next.setDate(next.getDate() + 1);
    }

    // Convert back to UTC by getting the offset
    const utcNext = new Date(
        now.getTime() + (next.getTime() - pacific.getTime())
    );
    return utcNext;
}

function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const absDiffMs = Math.abs(diffMs);

    const minutes = Math.floor(absDiffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const isPast = diffMs < 0;

    if (days > 0) {
        const label = days === 1 ? "1 day" : `${days} days`;
        return isPast ? `${label} ago` : `in ${label}`;
    }
    if (hours > 0) {
        const label = hours === 1 ? "1 hour" : `${hours} hours`;
        return isPast ? `${label} ago` : `in ${label}`;
    }
    if (minutes > 0) {
        const label = minutes === 1 ? "1 min" : `${minutes} min`;
        return isPast ? `${label} ago` : `in ${label}`;
    }
    return "just now";
}

function ScanTimingInfo({ jobs }: { jobs: JobListing[] }) {
    const lastScanTime = useMemo(() => {
        if (jobs.length === 0) return null;
        const dates = jobs
            .map((j) => new Date(j.discovered_at))
            .sort((a, b) => b.getTime() - a.getTime());
        return dates[0];
    }, [jobs]);

    const nextAutoScan = useMemo(() => getNextAutoScan(), []);

    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last scan:{" "}
                {lastScanTime
                    ? formatRelativeTime(lastScanTime)
                    : "No scans yet"}
            </span>
            <span>
                Next auto-scan: {formatRelativeTime(nextAutoScan)} (8:00 AM PT)
            </span>
        </div>
    );
}

