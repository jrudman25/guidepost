"use client";

import { useState, useEffect, useCallback } from "react";
import type { Application, ApplicationStatus } from "@/lib/types";
import { parseLocalDate, daysSince, toLocalDateString } from "@/lib/date-utils";
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
    Pencil,
    Reply,
} from "lucide-react";
import { toast } from "sonner";
import { cn, handleApiError, toastApiError } from "@/lib/utils";
import { PaginationControls } from "@/components/pagination-controls";

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

export default function ApplicationsPage() {
    const [applications, setApplications] = useState<Application[]>([]);
    const [page, setPage] = useState(1);
    const [totalApplications, setTotalApplications] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isFetching, setIsFetching] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [editingApp, setEditingApp] = useState<Application | null>(null);

    const emptyForm = {
        job_title: "",
        company: "",
        applied_at: new Date().toISOString().split("T")[0],
        applied_via: "",
        status: "applied" as ApplicationStatus,
        notes: "",
        url: "",
        heard_back_at: "",
    };

    // Form state (used for both add and edit)
    const [form, setForm] = useState(emptyForm);

    const fetchApplications = useCallback(async () => {
        setIsFetching(true);
        try {
            const limit = 20;
            const offset = (page - 1) * limit;
            const url =
                filterStatus === "all"
                    ? `/api/applications?limit=${limit}&offset=${offset}`
                    : `/api/applications?status=${filterStatus}&limit=${limit}&offset=${offset}`;
            const response = await fetch(url);
            const data = await response.json();
            setApplications(data.applications || []);
            setTotalApplications(data.total || 0);
        } catch (error) {
            console.error("Failed to fetch applications:", error);
        } finally {
            setLoading(false);
            setIsFetching(false);
        }
    }, [filterStatus, page]);

    useEffect(() => {
        fetchApplications();
    }, [fetchApplications]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const payload = {
            ...form,
            heard_back_at: form.heard_back_at || null,
        };

        try {
            if (editingApp) {
                // Edit mode — PATCH
                const response = await fetch(`/api/applications/${editingApp.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                await handleApiError(response, "Failed to update application");
                toast.success("Application updated!");
            } else {
                // Add mode — POST
                const response = await fetch("/api/applications", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                await handleApiError(response, "Failed to add application");
                toast.success("Application added!");
            }

            setDialogOpen(false);
            setEditingApp(null);
            setForm(emptyForm);
            fetchApplications();
        } catch (e) {
            toastApiError(e, editingApp ? "Failed to update application" : "Failed to add application");
        }
    }

    function openEditDialog(app: Application) {
        setEditingApp(app);
        setForm({
            job_title: app.job_title,
            company: app.company,
            applied_at: toLocalDateString(app.applied_at),
            applied_via: app.applied_via || "",
            status: app.status,
            notes: app.notes || "",
            url: app.url || "",
            heard_back_at: app.heard_back_at ? toLocalDateString(app.heard_back_at) : "",
        });
        setDialogOpen(true);
    }

    function openAddDialog() {
        setEditingApp(null);
        setForm(emptyForm);
        setDialogOpen(true);
    }

    async function updateStatus(id: string, status: ApplicationStatus) {
        try {
            const response = await fetch(`/api/applications/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });

            await handleApiError(response, "Failed to update application status");

            setApplications((prev) =>
                prev.map((a) => (a.id === id ? { ...a, status } : a))
            );
            toast.success("Status updated");
        } catch (e) {
            toastApiError(e, "Failed to update status");
        }
    }

    async function deleteApplication(id: string) {
        if (!confirm("Delete this application?")) return;

        try {
            const response = await fetch(`/api/applications/${id}`, {
                method: "DELETE",
            });

            await handleApiError(response, "Failed to delete application");

            toast.success("Application deleted");
            fetchApplications();
        } catch (e) {
            toastApiError(e, "Failed to delete application");
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

                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) {
                        setEditingApp(null);
                        setForm(emptyForm);
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button onClick={openAddDialog}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Application
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                {editingApp ? "Edit Application" : "Add New Application"}
                            </DialogTitle>
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
                            {form.status !== "applied" && (
                                <div className="space-y-2">
                                    <Label htmlFor="heard_back_at">Date Heard Back</Label>
                                    <Input
                                        id="heard_back_at"
                                        type="date"
                                        value={form.heard_back_at}
                                        onChange={(e) =>
                                            setForm((p) => ({ ...p, heard_back_at: e.target.value || "" }))
                                        }
                                    />
                                </div>
                            )}
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
                                {editingApp ? "Save Changes" : "Add Application"}
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
                        onClick={() => { setFilterStatus(status); setPage(1); }}
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
            ) : applications.length === 0 && !isFetching ? (
                <div className="rounded-xl border border-dashed border-border py-12 text-center">
                    <p className="text-muted-foreground">
                        No applications yet. Click &quot;Add Application&quot; to start
                        tracking.
                    </p>
                </div>
            ) : applications.length === 0 && isFetching ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className={cn("space-y-3 transition-opacity duration-200", isFetching && "opacity-50 pointer-events-none")}>
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
                                            {parseLocalDate(app.applied_at).toLocaleDateString()} (
                                            {daysSince(app.applied_at)} days ago)
                                        </span>
                                        {app.applied_via && (
                                            <span className="flex items-center gap-1">
                                                <Briefcase className="h-3.5 w-3.5" />
                                                {app.applied_via}
                                            </span>
                                        )}
                                        {app.heard_back_at && (
                                            <span className="flex items-center gap-1">
                                                <Reply className="h-3.5 w-3.5" />
                                                Heard back {parseLocalDate(toLocalDateString(app.heard_back_at)).toLocaleDateString()}
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

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => openEditDialog(app)}
                                        title="Edit application"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>

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
                    <PaginationControls
                        currentPage={page}
                        totalPages={Math.ceil(totalApplications / 20)}
                        onPageChange={setPage}
                    />
                </div>
            )}
        </div>
    );
}





