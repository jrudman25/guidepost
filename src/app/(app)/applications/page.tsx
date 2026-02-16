"use client";

import { useState, useEffect, useCallback } from "react";
import type { Application, ApplicationStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Loader2,
    Plus,
    Trash2,
    ExternalLink,
    Calendar,
    Building2,
    Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
    { value: "applied", label: "Applied" },
    { value: "screening", label: "Screening" },
    { value: "interview", label: "Interview" },
    { value: "offer", label: "Offer" },
    { value: "rejected", label: "Rejected" },
    { value: "ghosted", label: "Ghosted" },
];

const STATUS_COLORS: Record<ApplicationStatus, string> = {
    applied: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    screening: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    interview: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    offer: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    rejected: "bg-red-500/15 text-red-400 border-red-500/30",
    ghosted: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

function daysSince(dateStr: string): number {
    const date = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ApplicationsPage() {
    const [applications, setApplications] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>("all");

    // New application form state
    const [form, setForm] = useState({
        job_title: "",
        company: "",
        applied_at: new Date().toISOString().split("T")[0],
        applied_via: "",
        status: "applied" as ApplicationStatus,
        notes: "",
        url: "",
    });

    const fetchApplications = useCallback(async () => {
        try {
            const url =
                filterStatus === "all"
                    ? "/api/applications"
                    : `/api/applications?status=${filterStatus}`;
            const response = await fetch(url);
            const data = await response.json();
            setApplications(data.applications || []);
        } catch (error) {
            console.error("Failed to fetch applications:", error);
        } finally {
            setLoading(false);
        }
    }, [filterStatus]);

    useEffect(() => {
        fetchApplications();
    }, [fetchApplications]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        try {
            const response = await fetch("/api/applications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });

            if (!response.ok) throw new Error("Failed to create");

            toast.success("Application added!");
            setDialogOpen(false);
            setForm({
                job_title: "",
                company: "",
                applied_at: new Date().toISOString().split("T")[0],
                applied_via: "",
                status: "applied",
                notes: "",
                url: "",
            });
            fetchApplications();
        } catch {
            toast.error("Failed to add application");
        }
    }

    async function updateStatus(id: string, status: ApplicationStatus) {
        try {
            const response = await fetch(`/api/applications/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });

            if (!response.ok) throw new Error("Failed to update");

            setApplications((prev) =>
                prev.map((a) => (a.id === id ? { ...a, status } : a))
            );
            toast.success("Status updated");
        } catch {
            toast.error("Failed to update status");
        }
    }

    async function deleteApplication(id: string) {
        if (!confirm("Delete this application?")) return;

        try {
            const response = await fetch(`/api/applications/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error("Failed to delete");

            toast.success("Application deleted");
            fetchApplications();
        } catch {
            toast.error("Failed to delete application");
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Applications</h1>
                    <p className="mt-1 text-muted-foreground">
                        Track your submitted job applications and their current status.
                    </p>
                </div>

                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Application
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add New Application</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="job_title">Job Title *</Label>
                                <Input
                                    id="job_title"
                                    required
                                    placeholder="e.g. Senior Software Engineer"
                                    value={form.job_title}
                                    onChange={(e) =>
                                        setForm((p) => ({ ...p, job_title: e.target.value }))
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="company">Company *</Label>
                                <Input
                                    id="company"
                                    required
                                    placeholder="e.g. Google"
                                    value={form.company}
                                    onChange={(e) =>
                                        setForm((p) => ({ ...p, company: e.target.value }))
                                    }
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="applied_at">Date Applied</Label>
                                    <Input
                                        id="applied_at"
                                        type="date"
                                        value={form.applied_at}
                                        onChange={(e) =>
                                            setForm((p) => ({ ...p, applied_at: e.target.value }))
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="applied_via">Applied Via</Label>
                                    <Input
                                        id="applied_via"
                                        placeholder="e.g. LinkedIn, Company site"
                                        value={form.applied_via}
                                        onChange={(e) =>
                                            setForm((p) => ({ ...p, applied_via: e.target.value }))
                                        }
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Status</Label>
                                <Select
                                    value={form.status}
                                    onValueChange={(v) =>
                                        setForm((p) => ({ ...p, status: v as ApplicationStatus }))
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STATUS_OPTIONS.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="url">Job Posting URL</Label>
                                <Input
                                    id="url"
                                    type="url"
                                    placeholder="https://..."
                                    value={form.url}
                                    onChange={(e) =>
                                        setForm((p) => ({ ...p, url: e.target.value }))
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea
                                    id="notes"
                                    placeholder="Any notes about this application..."
                                    value={form.notes}
                                    onChange={(e) =>
                                        setForm((p) => ({ ...p, notes: e.target.value }))
                                    }
                                />
                            </div>
                            <Button type="submit" className="w-full">
                                Add Application
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                {["all", ...STATUS_OPTIONS.map((s) => s.value)].map((status) => (
                    <Button
                        key={status}
                        variant={filterStatus === status ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterStatus(status)}
                    >
                        {status === "all"
                            ? "All"
                            : STATUS_OPTIONS.find((s) => s.value === status)?.label}
                    </Button>
                ))}
            </div>

            {/* Application list */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : applications.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-12 text-center">
                    <p className="text-muted-foreground">
                        No applications yet. Click &quot;Add Application&quot; to start
                        tracking.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {applications.map((app) => (
                        <div
                            key={app.id}
                            className="rounded-xl border border-border bg-card p-5"
                        >
                            <div className="flex items-center justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-3">
                                        <h3 className="truncate font-semibold">{app.job_title}</h3>
                                        <Badge
                                            variant="outline"
                                            className={cn("text-xs", STATUS_COLORS[app.status])}
                                        >
                                            {STATUS_OPTIONS.find((s) => s.value === app.status)
                                                ?.label}
                                        </Badge>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Building2 className="h-3.5 w-3.5" />
                                            {app.company}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Calendar className="h-3.5 w-3.5" />
                                            {new Date(app.applied_at).toLocaleDateString()} (
                                            {daysSince(app.applied_at)} days ago)
                                        </span>
                                        {app.applied_via && (
                                            <span className="flex items-center gap-1">
                                                <Briefcase className="h-3.5 w-3.5" />
                                                {app.applied_via}
                                            </span>
                                        )}
                                    </div>
                                    {app.notes && (
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            {app.notes}
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <Select
                                        value={app.status}
                                        onValueChange={(v) =>
                                            updateStatus(app.id, v as ApplicationStatus)
                                        }
                                    >
                                        <SelectTrigger className="w-[130px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STATUS_OPTIONS.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {app.url && (
                                        <Button variant="ghost" size="icon" asChild>
                                            <a href={app.url} target="_blank" rel="noopener noreferrer">
                                                <ExternalLink className="h-4 w-4" />
                                            </a>
                                        </Button>
                                    )}

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => deleteApplication(app.id)}
                                        className="text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
