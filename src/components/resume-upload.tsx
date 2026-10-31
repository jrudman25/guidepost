"use client";

import { useState, useCallback } from "react";
import { Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn, handleApiError, toastApiError } from "@/lib/utils";

const MAX_FILE_SIZE = 4 * 1024 * 1024;

interface ResumeUploadProps {
    onUploadComplete: () => void;
}

export function ResumeUpload({ onUploadComplete }: ResumeUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const selectFile = useCallback((file?: File) => {
        if (!file) return;
        if (file.type !== "application/pdf") {
            toast.error("Please upload a PDF file");
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            toast.error("Resume PDFs must be 4 MB or smaller");
            return;
        }
        setSelectedFile(file);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        selectFile(e.dataTransfer.files[0]);
    }, [selectFile]);

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            selectFile(e.target.files?.[0]);
        },
        [selectFile]
    );

    async function handleUpload() {
        if (!selectedFile) return;

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

            const response = await fetch("/api/resumes/upload", {
                method: "POST",
                body: formData,
            });

            await handleApiError(response, "Upload failed");

            toast.success("Resume uploaded and parsed successfully!");
            setSelectedFile(null);
            onUploadComplete();
        } catch (e) {
            toastApiError(e, "Failed to upload resume");
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="space-y-4">
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors",
                    isDragging
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/50",
                    uploading && "pointer-events-none opacity-50"
                )}
            >
                {selectedFile ? (
                    <div className="flex flex-col items-center gap-3">
                        <FileText className="h-10 w-10 text-primary" />
                        <div className="text-center">
                            <p className="font-medium">{selectedFile.name}</p>
                            <p className="text-sm text-muted-foreground">
                                {(selectedFile.size / 1024).toFixed(1)} KB
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleUpload} disabled={uploading}>
                                {uploading && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {uploading ? "Parsing..." : "Upload & Parse"}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setSelectedFile(null)}
                                disabled={uploading}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <label className="flex cursor-pointer flex-col items-center gap-3">
                        <Upload className="h-10 w-10 text-muted-foreground" />
                        <div className="text-center">
                            <p className="font-medium">
                                Drop your resume here or click to browse
                            </p>
                            <p className="text-sm text-muted-foreground">
                                PDF files only (max 4 MB)
                            </p>
                        </div>
                        <input
                            type="file"
                            accept=".pdf"
                            className="sr-only"
                            onChange={handleFileSelect}
                        />
                    </label>
                )}
            </div>
        </div>
    );
}
