"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function AppError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service if available
        console.error("App Error Boundary caught:", error);
    }, [error]);

    return (
        <div className="flex h-[80vh] w-full flex-col items-center justify-center space-y-6 text-center">
            <div className="rounded-full bg-destructive/10 p-6">
                <AlertCircle className="h-12 w-12 text-destructive" />
            </div>

            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
                <p className="text-muted-foreground max-w-[500px] mx-auto">
                    An unexpected error occurred while loading this page. Re-rendering the segment may resolve the issue.
                </p>
            </div>

            <Button onClick={() => reset()} className="mt-4 gap-2">
                <RefreshCw className="h-4 w-4" />
                Try again
            </Button>

            {/* Optional: Show technically detailed error only in development */}
            {process.env.NODE_ENV === "development" && (
                <div className="mt-8 rounded-lg bg-muted p-4 text-left font-mono text-sm overflow-auto max-w-2xl w-full border border-border">
                    <p className="font-semibold text-destructive mb-2">{error.message}</p>
                    <p className="text-muted-foreground whitespace-pre-wrap">{error.stack}</p>
                </div>
            )}
        </div>
    );
}
