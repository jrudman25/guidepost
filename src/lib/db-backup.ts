import type { SupabaseClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "db-backups";
const RETENTION_DAYS = 30;

/**
 * Tables to back up. These contain user-generated data that
 * would be painful to lose.
 */
const BACKUP_TABLES = [
    "resumes",
    "search_filters",
    "job_listings",
    "applications",
    "status_history",
] as const;

interface BackupResult {
    tables: Record<string, number>;
    totalRows: number;
    sizeBytes: number;
    error?: string;
}

/**
 * Export critical database tables as a JSON snapshot and upload
 * to Supabase Storage. Runs with the service client (bypasses RLS)
 * so it captures data for ALL users.
 *
 * Each backup is a single JSON file named by date + timestamp:
 *   e.g., "2026-02-28T16-00-00.json"
 */
export async function createBackup(supabase: SupabaseClient): Promise<BackupResult> {
    const result: BackupResult = { tables: {}, totalRows: 0, sizeBytes: 0 };

    try {
        const snapshot: Record<string, unknown[]> = {};

        for (const table of BACKUP_TABLES) {
            const { data, error } = await supabase
                .from(table)
                .select("*")
                .limit(10000); // safety limit

            if (error) {
                console.error(`[backup] Failed to export ${table}:`, error.message);
                snapshot[table] = [];
                result.tables[table] = 0;
                continue;
            }

            snapshot[table] = data || [];
            result.tables[table] = (data || []).length;
            result.totalRows += (data || []).length;
        }

        // Build the backup file
        const backupData = {
            created_at: new Date().toISOString(),
            tables: snapshot,
            meta: {
                table_names: BACKUP_TABLES,
                row_counts: result.tables,
                total_rows: result.totalRows,
            },
        };

        const json = JSON.stringify(backupData, null, 2);
        result.sizeBytes = new Blob([json]).size;

        // Upload to storage
        const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
        const filePath = `${timestamp}.json`;

        const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(filePath, new Blob([json], { type: "application/json" }), {
                contentType: "application/json",
            });

        if (uploadError) {
            result.error = `Upload failed: ${uploadError.message}`;
            console.error("[backup]", result.error);
        } else {
            console.log(`[backup] Created backup: ${filePath} (${(result.sizeBytes / 1024).toFixed(1)} KB, ${result.totalRows} rows)`);
        }

        return result;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.error = msg;
        console.error("[backup] Backup failed:", msg);
        return result;
    }
}

/**
 * Delete backup files older than RETENTION_DAYS.
 */
export async function pruneOldBackups(supabase: SupabaseClient): Promise<number> {
    try {
        const { data: files, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .list("", { limit: 200, sortBy: { column: "name", order: "asc" } });

        if (error || !files) {
            console.error("[backup] Failed to list backups for pruning:", error?.message);
            return 0;
        }

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
        const cutoffStr = cutoff.toISOString().replace(/:/g, "-").split(".")[0];

        const toDelete = files
            .filter((f) => f.name.endsWith(".json") && f.name < `${cutoffStr}.json`)
            .map((f) => f.name);

        if (toDelete.length === 0) return 0;

        const { error: deleteError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove(toDelete);

        if (deleteError) {
            console.error("[backup] Failed to prune backups:", deleteError.message);
            return 0;
        }

        console.log(`[backup] Pruned ${toDelete.length} old backup(s)`);
        return toDelete.length;
    } catch (err) {
        console.error("[backup] Error pruning backups:", err);
        return 0;
    }
}
