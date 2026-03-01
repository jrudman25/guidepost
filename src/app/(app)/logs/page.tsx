"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ChevronLeft } from "lucide-react";

interface LogEntry {
    date: string;
    filename: string;
}

export default function LogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [logContent, setLogContent] = useState<string>("");
    const [loadingContent, setLoadingContent] = useState(false);

    async function fetchLogs() {
        setLoading(true);
        try {
            const response = await fetch("/api/logs");
            const data = await response.json();
            setLogs(data.logs || []);
        } catch {
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }

    async function fetchLogContent(date: string) {
        setLoadingContent(true);
        setSelectedDate(date);
        try {
            const response = await fetch(`/api/logs/${date}`);
            const data = await response.json();
            setLogContent(data.content || "No content available.");
        } catch {
            setLogContent("Failed to load log content.");
        } finally {
            setLoadingContent(false);
        }
    }

    useEffect(() => {
        fetchLogs();
    }, []);

    // Format a YYYY-MM-DD date string nicely
    function formatDate(dateStr: string) {
        const [year, month, day] = dateStr.split("-").map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }

    function isToday(dateStr: string) {
        return dateStr === new Date().toISOString().split("T")[0];
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // Log content view
    if (selectedDate) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            setSelectedDate(null);
                            setLogContent("");
                        }}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            Pipeline Log
                        </h1>
                        <p className="mt-1 text-muted-foreground">
                            {formatDate(selectedDate)}
                        </p>
                    </div>
                </div>

                {loadingContent ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="rounded-xl border border-border bg-card p-6">
                        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
                            {logContent}
                        </pre>
                    </div>
                )}
            </div>
        );
    }

    // Log list view
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Pipeline Logs
                    </h1>
                    <p className="mt-1 text-muted-foreground">
                        Search pipeline run history. Logs are kept for 14 days.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchLogs}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                </Button>
            </div>

            {logs.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-12 text-center">
                    <p className="text-muted-foreground">
                        No pipeline logs yet. Logs are created when a search runs
                        (daily cron or manual trigger).
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {logs.map((log) => (
                        <button
                            key={log.date}
                            onClick={() => fetchLogContent(log.date)}
                            className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
                        >
                            <div className="flex items-center gap-3">
                                <span className="font-medium">
                                    {formatDate(log.date)}
                                </span>
                                {isToday(log.date) && (
                                    <Badge variant="secondary">Today</Badge>
                                )}
                            </div>
                            <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
