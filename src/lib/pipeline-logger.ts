import type { SupabaseClient } from "@supabase/supabase-js";

interface LogEntry {
    timestamp: string;
    level: "info" | "warn" | "error";
    category: string;
    message: string;
}

const STORAGE_BUCKET = "pipeline-logs";
const RETENTION_DAYS = 14;

/**
 * Collects structured log entries during a search pipeline run,
 * then writes them to Supabase Storage as a daily markdown file.
 */
export class PipelineLogger {
    private entries: LogEntry[] = [];
    private startTime: Date;

    constructor() {
        this.startTime = new Date();
    }

    info(category: string, message: string) {
        this.add("info", category, message);
    }

    warn(category: string, message: string) {
        this.add("warn", category, message);
    }

    error(category: string, message: string) {
        this.add("error", category, message);
    }

    private add(level: LogEntry["level"], category: string, message: string) {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            category,
            message,
        };
        this.entries.push(entry);
        // Also log to console for Vercel's built-in log viewer
        const prefix = `[${category}]`;
        if (level === "error") {
            console.error(prefix, message);
        } else if (level === "warn") {
            console.warn(prefix, message);
        } else {
            console.log(prefix, message);
        }
    }

    /**
     * Format entries as readable markdown.
     */
    toMarkdown(): string {
        const endTime = new Date();
        const durationMs = endTime.getTime() - this.startTime.getTime();
        const durationSec = (durationMs / 1000).toFixed(1);

        const errorCount = this.entries.filter((e) => e.level === "error").length;
        const warnCount = this.entries.filter((e) => e.level === "warn").length;

        const lines: string[] = [];
        lines.push(`## Search Run \u2014 ${this.startTime.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`);
        lines.push("");
        lines.push(`| Metric | Value |`);
        lines.push(`|--------|-------|`);
        lines.push(`| Duration | ${durationSec}s |`);
        lines.push(`| Log entries | ${this.entries.length} |`);
        lines.push(`| Errors | ${errorCount} |`);
        lines.push(`| Warnings | ${warnCount} |`);
        lines.push("");

        if (this.entries.length === 0) {
            lines.push("_No log entries recorded._");
            return lines.join("\n");
        }

        // Group by category for readability
        const categories = [...new Set(this.entries.map((e) => e.category))];

        for (const category of categories) {
            const catEntries = this.entries.filter((e) => e.category === category);
            lines.push(`### ${category}`);
            lines.push("");

            for (const entry of catEntries) {
                const time = entry.timestamp.split("T")[1].split(".")[0];
                const icon = entry.level === "error" ? "\u274c" : entry.level === "warn" ? "\u26a0\ufe0f" : "\u2705";
                lines.push(`- ${icon} \`${time}\` ${entry.message}`);
            }
            lines.push("");
        }

        return lines.join("\n");
    }

    /**
     * Write the log to Supabase Storage as part of the daily log file.
     * Appends to the existing file if one exists for today.
     */
    async persist(supabase: SupabaseClient): Promise<void> {
        if (this.entries.length === 0) return;

        try {
            const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
            const filePath = `${today}.md`;
            const newContent = this.toMarkdown();

            // Try to read existing log for today
            let existingContent = "";
            const { data: existingFile } = await supabase.storage
                .from(STORAGE_BUCKET)
                .download(filePath);

            if (existingFile) {
                existingContent = await existingFile.text();
            }

            // Build the full file
            const header = existingContent
                ? existingContent
                : `# Pipeline Logs \u2014 ${today}\n\n`;
            const fullContent = `${header}\n---\n\n${newContent}\n`;

            // Upload (upsert)
            const { error } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(filePath, new Blob([fullContent], { type: "text/markdown" }), {
                    upsert: true,
                    contentType: "text/markdown",
                });

            if (error) {
                console.error("[pipeline-log] Failed to persist log:", error.message);
            }
        } catch (err) {
            console.error("[pipeline-log] Error persisting log:", err);
        }
    }

    /**
     * Delete log files older than RETENTION_DAYS.
     */
    static async pruneOldLogs(supabase: SupabaseClient): Promise<number> {
        try {
            const { data: files, error } = await supabase.storage
                .from(STORAGE_BUCKET)
                .list("", { limit: 100, sortBy: { column: "name", order: "asc" } });

            if (error || !files) {
                console.error("[pipeline-log] Failed to list logs for pruning:", error?.message);
                return 0;
            }

            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
            const cutoffStr = cutoff.toISOString().split("T")[0]; // YYYY-MM-DD

            const toDelete = files
                .filter((f) => f.name.endsWith(".md") && f.name < `${cutoffStr}.md`)
                .map((f) => f.name);

            if (toDelete.length === 0) return 0;

            const { error: deleteError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .remove(toDelete);

            if (deleteError) {
                console.error("[pipeline-log] Failed to prune logs:", deleteError.message);
                return 0;
            }

            return toDelete.length;
        } catch (err) {
            console.error("[pipeline-log] Error pruning logs:", err);
            return 0;
        }
    }
}
