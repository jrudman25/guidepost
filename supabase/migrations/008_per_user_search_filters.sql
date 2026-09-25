-- 008_per_user_search_filters.sql
-- Make search_filters per-user instead of per-resume: one row per user,
-- applied to all of that user's active resumes. Uploading a new resume
-- should no longer reset the user's filters.
--
-- WARNING: this deletes duplicate filter rows (keeps one per user) and must
-- be applied together with the deploy that switches the app to per-user
-- filters. Keep the row with a location set, breaking ties toward the most
-- recently uploaded resume.

begin;

with ranked as (
  select sf.id,
         row_number() over (
           partition by sf.user_id
           order by (sf.location is not null) desc, r.uploaded_at desc nulls last
         ) as rn
  from public.search_filters sf
  left join public.resumes r on r.id = sf.resume_id
)
delete from public.search_filters sf
using ranked
where ranked.id = sf.id and ranked.rn > 1;

drop index if exists public.search_filters_resume_id_idx;

alter table public.search_filters drop column if exists resume_id;

create unique index if not exists search_filters_user_id_idx
  on public.search_filters(user_id);

commit;
