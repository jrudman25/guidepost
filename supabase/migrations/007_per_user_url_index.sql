-- 007_per_user_url_index.sql
-- Scope job_listings.url uniqueness per user.
-- The original index was global on (url), so a second user searching for the
-- same posting would hit a unique violation and silently lose the listing.

drop index if exists public.job_listings_url_idx;

create unique index if not exists job_listings_url_idx
  on public.job_listings(user_id, url)
  where url is not null;
