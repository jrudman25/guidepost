"use client";

import { useState } from "react";
import Link from "next/link";
import type { Resume } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ResumeCardProps {
    resume: Resume;
    onUpdate: () => void;
}

export function ResumeCard({ resume, onUpdate }: ResumeCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);

    const parsed = resume.parsed_data;

    async function toggleActive() {
        setLoading(true);
        try {
            const response = await fetch(`/api/resumes/${resume.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: !resume.is_active }),
            });

            if (!response.ok) throw new Error("Failed to update");

            toast.success(
                resume.is_active
                    ? "Resume paused \u2014 will not be included in daily scans"
                    : "Resume activated \u2014 will be included in daily scans"
            );
            onUpdate();
        } catch {
            toast.error("Failed to update resume");
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

            if (!response.ok) throw new Error("Failed to delete");

            toast.success("Resume deleted");
            onUpdate();
        } catch {
            toast.error("Failed to delete resume");
        } finally {
            setLoading(false);
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
                        asChild
                        title="Edit search filters"
                    >
                        <Link href={`/resumes/${resume.id}/filters`}>
                            <SlidersHorizontal className="h-4 w-4" />
                        </Link>
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
                            </div>
                            <ul className="space-y-1">
                                {parsed.job_titles.map((title) => (
                                    <li key={title} className="text-sm text-muted-foreground">
                                        {title}
                                    </li>
                                ))}
                            </ul>
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
