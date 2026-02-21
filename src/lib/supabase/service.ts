import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client using the service role key.
 * This bypasses RLS and should ONLY be used for server-side
 * operations that run without a user session (e.g., cron jobs).
 */
export function createServiceClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    return createSupabaseClient(supabaseUrl, serviceKey);
}
