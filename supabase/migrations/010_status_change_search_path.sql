-- 010: Pin search_path on log_application_status_change()
--
-- Supabase advisor lint 0011 (function_search_path_mutable): functions without
-- an explicit search_path resolve unqualified names against the caller's
-- session path at run time, which allows object shadowing. The trigger body
-- is already schema-qualified and only calls pg_catalog builtins (searched
-- implicitly), so an empty path is safe.
alter function public.log_application_status_change() set search_path = '';
