-- 009: Lock down storage bucket policies and make the demo account read-only
-- at the database layer.
--
-- Before: every authenticated user could SELECT/INSERT/DELETE any object in
-- `resumes` and SELECT/INSERT/UPDATE objects in `pipeline-logs`, and the demo
-- account's read-only guarantee lived only in the Next.js proxy (bypassable
-- via direct PostgREST/Storage API calls).
--
-- After: `pipeline-logs` and `db-backups` have no authenticated policies
-- (service role only), `resumes` is scoped to each user's <user_id>/ folder,
-- and restrictive policies deny all INSERT/UPDATE/DELETE for the demo account
-- on public tables and storage objects. Demo identity is keyed on the JWT
-- email claim, matching the check in src/proxy.ts.

-- ---- Move legacy root-level resume objects into the owner's <user_id>/ folder
-- (uploads are prefixed with user_id since the multi-tenant change, but rows
-- created before that still point at bucket-root paths)
update storage.objects o
set name = r.user_id::text || '/' || o.name
from public.resumes r
where o.bucket_id = 'resumes'
  and o.name = r.file_path
  and position('/' in o.name) = 0;

update public.resumes r
set file_path = r.user_id::text || '/' || r.file_path
where position('/' in r.file_path) = 0
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'resumes'
      and o.name = r.user_id::text || '/' || r.file_path
  );

-- ---- Storage: remove blanket authenticated access
drop policy if exists "Authenticated users can read resumes" on storage.objects;
drop policy if exists "Authenticated users can upload resumes" on storage.objects;
drop policy if exists "Authenticated users can delete resumes" on storage.objects;
drop policy if exists "Authenticated users can update resumes" on storage.objects;
drop policy if exists "Authenticated users can read logs 16a8yd6_0" on storage.objects;
drop policy if exists "Authenticated users can update logs 16a8yd6_0" on storage.objects;
drop policy if exists "Authenticated users can update logs 16a8yd6_1" on storage.objects;
drop policy if exists "Authenticated users can write logs 16a8yd6_0" on storage.objects;

-- ---- Storage: per-user-folder access to resumes (pipeline-logs and
-- db-backups intentionally get no authenticated policies)
create policy "Users manage their own resume files"
on storage.objects for all to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---- Demo account is read-only at the database layer.
-- `is distinct from` is null-safe: only a JWT whose email claim is the demo
-- address is denied. Service role bypasses RLS, so cron/seeding are unaffected.

-- Storage objects (any bucket)
create policy "demo_no_insert" on storage.objects
  as restrictive for insert to authenticated
  with check ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
create policy "demo_no_update" on storage.objects
  as restrictive for update to authenticated
  using ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app')
  with check ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
create policy "demo_no_delete" on storage.objects
  as restrictive for delete to authenticated
  using ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');

-- Resumes
create policy "demo_no_insert" on public.resumes
  as restrictive for insert to authenticated
  with check ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
create policy "demo_no_update" on public.resumes
  as restrictive for update to authenticated
  using ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app')
  with check ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
create policy "demo_no_delete" on public.resumes
  as restrictive for delete to authenticated
  using ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');

-- Search Filters
create policy "demo_no_insert" on public.search_filters
  as restrictive for insert to authenticated
  with check ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
create policy "demo_no_update" on public.search_filters
  as restrictive for update to authenticated
  using ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app')
  with check ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
create policy "demo_no_delete" on public.search_filters
  as restrictive for delete to authenticated
  using ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');

-- Job Listings
create policy "demo_no_insert" on public.job_listings
  as restrictive for insert to authenticated
  with check ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
create policy "demo_no_update" on public.job_listings
  as restrictive for update to authenticated
  using ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app')
  with check ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
create policy "demo_no_delete" on public.job_listings
  as restrictive for delete to authenticated
  using ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');

-- Applications
create policy "demo_no_insert" on public.applications
  as restrictive for insert to authenticated
  with check ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
create policy "demo_no_update" on public.applications
  as restrictive for update to authenticated
  using ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app')
  with check ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
create policy "demo_no_delete" on public.applications
  as restrictive for delete to authenticated
  using ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');

-- Status History
create policy "demo_no_insert" on public.status_history
  as restrictive for insert to authenticated
  with check ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
create policy "demo_no_update" on public.status_history
  as restrictive for update to authenticated
  using ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app')
  with check ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
create policy "demo_no_delete" on public.status_history
  as restrictive for delete to authenticated
  using ((auth.jwt() ->> 'email') is distinct from 'demo@guidepostai.app');
