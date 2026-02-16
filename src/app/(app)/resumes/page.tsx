"use client";

import { useState, useEffect, useCallback } from "react";
import type { Resume } from "@/lib/types";
import { ResumeUpload } from "@/components/resume-upload";
import { ResumeCard } from "@/components/resume-card";
import { Loader2 } from "lucide-react";

export default function ResumesPage() {
    const [resumes, setResumes] = useState<Resume[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchResumes = useCallback(async () => {
        try {
            const response = await fetch("/api/resumes");
            const data = await response.json();
            setResumes(data.resumes || []);
        } catch (error) {
            console.error("Failed to fetch resumes:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchResumes();
    }, [fetchResumes]);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Resumes</h1>
                <p className="mt-2 text-muted-foreground">
                    Upload and manage your resumes. Active resumes are scanned daily for
                    matching jobs.
                </p>
            </div>

            {/* Upload section */}
            <ResumeUpload onUploadComplete={fetchResumes} />

            {/* Resume list */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : resumes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-12 text-center">
                    <p className="text-muted-foreground">
                        No resumes uploaded yet. Upload one to get started!
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {resumes.map((resume) => (
                        <ResumeCard
                            key={resume.id}
                            resume={resume}
                            onUpdate={fetchResumes}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
