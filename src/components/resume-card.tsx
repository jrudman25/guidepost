"use client";

import { useState } from "react";
import type { Resume } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
    FileText,
    Trash2,
    ToggleLeft,
    ToggleRight,
    ChevronDown,
    ChevronUp,
    Briefcase,
    GraduationCap,
    Wrench,
    Loader2,
    Pencil,
    Plus,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { handleApiError, toastApiError } from "@/lib/utils";
import { MAX_JOB_TITLES } from "@/lib/job-titles-input";

interface ResumeCardProps {
    resume: Resume;
    onUpdate: () => void;
}

export function ResumeCard({ resume, onUpdate }: ResumeCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [editingTitles, setEditingTitles] = useState(false);
    const [savingTitles, setSavingTitles] = useState(false);
    const [editTitles, setEditTitles] = useState<string[]>([]);
    const [titleInput, setTitleInput] = useState("");

    const parsed = resume.parsed_data;

    async function toggleActive() {
        setLoading(true);
        try {
            const response = await fetch(`/api/resumes/${resume.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: !resume.is_active }),
            });

            await handleApiError(response, "Failed to update resume");

            toast.success(
                resume.is_active
                    ? "Resume paused \u2014 will not be included in daily scans"
                    : "Resume activated \u2014 will be included in daily scans"
            );
            onUpdate();
        } catch (e) {
            toastApiError(e, "Failed to update resume");
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete() {
        if (!confirm("Are you sure you want to delete this resume?")) return;

        setLoading(true);
        try {
            const response = await fetch(`/api/resumes/${resume.id}`, {
                method: "DELETE",
            });

            await handleApiError(response, "Failed to delete resume");

            toast.success("Resume deleted");
            onUpdate();
        } catch (e) {
            toastApiError(e, "Failed to delete resume");
        } finally {
            setLoading(false);
        }
    }

    function startEditTitles() {
        setEditTitles(parsed?.job_titles ?? []);
        setTitleInput("");
        setEditingTitles(true);
    }

    function addTitle() {
        const title = titleInput.trim();
        if (
            title &&
            editTitles.length < MAX_JOB_TITLES &&
            !editTitles.some((t) => t.toLowerCase() === title.toLowerCase())
        ) {
            setEditTitles((prev) => [...prev, title]);
            setTitleInput("");
        }
    }

    function removeTitle(title: string) {
        setEditTitles((prev) => prev.filter((t) => t !== title));
    }

    async function saveTitles() {
        setSavingTitles(true);
        try {
            const response = await fetch(`/api/resumes/${resume.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ job_titles: editTitles }),
            });

            await handleApiError(response, "Failed to update job titles");

            toast.success("Job titles updated");
            setEditingTitles(false);
            onUpdate();
        } catch (e) {
            toastApiError(e, "Failed to update job titles");
        } finally {
            setSavingTitles(false);
        }
    }

    return (
        <div className="rounded-xl border border-border bg-card">
            {/* Header */}
            <div className="flex items-center justify-between p-5">
                <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                        <h3 className="font-semibold">{resume.file_name}</h3>
                        <p className="text-xs text-muted-foreground">
                            Uploaded {new Date(resume.uploaded_at).toLocaleDateString()}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Badge
                        variant={resume.is_active ? "default" : "secondary"}
                        className="text-xs"
                    >
                        {resume.is_active ? "Active" : "Paused"}
                    </Badge>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleActive}
                        disabled={loading}
                        title={resume.is_active ? "Pause scanning" : "Activate scanning"}
                    >
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : resume.is_active ? (
                            <ToggleRight className="h-4 w-4 text-primary" />
                        ) : (
                            <ToggleLeft className="h-4 w-4" />
                        )}
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleDelete}
                        disabled={loading}
                        className="text-destructive hover:text-destructive"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? (
                            <ChevronUp className="h-4 w-4" />
                        ) : (
                            <ChevronDown className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </div>

            {/* Parsed data preview (always visible) */}
            {parsed && (
                <div className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">{parsed.summary}</p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {parsed.skills.slice(0, expanded ? undefined : 6).map((skill) => (
                            <Badge key={skill} variant="secondary" className="text-xs">
                                {skill}
                            </Badge>
                        ))}
                        {!expanded && parsed.skills.length > 6 && (
                            <Badge variant="outline" className="text-xs">
                                +{parsed.skills.length - 6} more
                            </Badge>
                        )}
                    </div>
                </div>
            )}

            {/* Expanded details */}
            {expanded && parsed && (
                <>
                    <Separator />
                    <div className="grid gap-4 p-5 md:grid-cols-3">
                        {/* Job Titles */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Briefcase className="h-4 w-4 text-muted-foreground" />
                                Job Titles
                                {!editingTitles && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={startEditTitles}
                                        title="Edit job titles"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Only the first 4 titles are used in searches.
                            </p>
                            {editingTitles ? (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-1.5">
                                        {editTitles.map((title) => (
                                            <Badge
                                                key={title}
                                                variant="secondary"
                                                className="gap-1"
                                            >
                                                {title}
                                                <button onClick={() => removeTitle(title)}>
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Add a job title"
                                            value={titleInput}
                                            onChange={(e) => setTitleInput(e.target.value)}
                                            onKeyDown={(e) =>
                                                e.key === "Enter" && (e.preventDefault(), addTitle())
                                            }
                                            disabled={editTitles.length >= MAX_JOB_TITLES}
                                        />
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={addTitle}
                                            disabled={editTitles.length >= MAX_JOB_TITLES}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            onClick={saveTitles}
                                            disabled={savingTitles}
                                        >
                                            {savingTitles && (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            )}
                                            Save
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setEditingTitles(false)}
                                            disabled={savingTitles}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <ul className="space-y-1">
                                    {parsed.job_titles.map((title, i) => (
                                        <li key={title} className="text-sm text-muted-foreground">
                                            {title}
                                            {i >= 4 && (
                                                <span className="text-muted-foreground/60">
                                                    {" (not searched)"}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Education */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                                Education
                            </div>
                            <ul className="space-y-1">
                                {parsed.education.length > 0 ? (
                                    parsed.education.map((edu) => (
                                        <li key={edu} className="text-sm text-muted-foreground">
                                            {edu}
                                        </li>
                                    ))
                                ) : (
                                    <li className="text-sm text-muted-foreground">
                                        Not specified
                                    </li>
                                )}
                            </ul>
                        </div>

                        {/* Experience & Certs */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Wrench className="h-4 w-4 text-muted-foreground" />
                                Details
                            </div>
                            <ul className="space-y-1 text-sm text-muted-foreground">
                                <li>{parsed.years_of_experience} years experience</li>
                                {parsed.certifications.map((cert) => (
                                    <li key={cert}>{cert}</li>
                                ))}
                                {parsed.industries.length > 0 && (
                                    <li>
                                        Industries: {parsed.industries.join(", ")}
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
