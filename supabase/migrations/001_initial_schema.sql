-- Guidepost: Initial Schema
-- Run this in Supabase SQL Editor to set up all tables.

-- ============================================
-- Resumes
-- ============================================
create table public.resumes (
  id uuid default gen_random_uuid() primary key,
  file_path text not null,
  file_name text not null,
  uploaded_at timestamptz default now() not null,
  parsed_data jsonb,
  is_active boolean default true not null
);

-- ============================================
-- Search Filters (per resume)
-- ============================================
create table public.search_filters (
  id uuid default gen_random_uuid() primary key,
  resume_id uuid references public.resumes(id) on delete cascade not null,
  keywords text[] default '{}',
  location text,
  remote_preference text default 'any' check (remote_preference in ('remote', 'hybrid', 'onsite', 'any')),
  min_salary integer,
  max_listing_age_days integer default 7,
  excluded_companies text[] default '{}'
);

-- One filter set per resume
create unique index search_filters_resume_id_idx on public.search_filters(resume_id);

-- ============================================
-- Job Listings
-- ============================================
create table public.job_listings (
  id uuid default gen_random_uuid() primary key,
  resume_id uuid references public.resumes(id) on delete set null,
  title text not null,
  company text not null,
  location text,
  description text,
  url text,
  source text,
  posted_at timestamptz,
  discovered_at timestamptz default now() not null,
  match_score integer check (match_score >= 0 and match_score <= 100),
  match_reasoning text,
  status text default 'new' check (status in ('new', 'saved', 'dismissed', 'applied')),
  salary_info text,
  is_remote boolean default false
);

-- Index for inbox queries (sorted by match score, filtered by status)
create index job_listings_status_score_idx on public.job_listings(status, match_score desc);
-- Deduplicate by URL
create unique index job_listings_url_idx on public.job_listings(url) where url is not null;

-- ============================================
-- Applications
-- ============================================
create table public.applications (
  id uuid default gen_random_uuid() primary key,
  job_listing_id uuid references public.job_listings(id) on delete set null,
  job_title text not null,
  company text not null,
  applied_at date default current_date not null,
  applied_via text,
  status text default 'applied' check (status in ('applied', 'screening', 'interview', 'offer', 'rejected', 'ghosted')),
  status_updated_at timestamptz default now() not null,
  notes text,
  url text
);

create index applications_status_idx on public.applications(status);
create index applications_applied_at_idx on public.applications(applied_at desc);

-- ============================================
-- Status History (for tracking timeline)
-- ============================================
create table public.status_history (
  id uuid default gen_random_uuid() primary key,
  application_id uuid references public.applications(id) on delete cascade not null,
  from_status text,
  to_status text not null,
  changed_at timestamptz default now() not null
);

create index status_history_app_idx on public.status_history(application_id, changed_at desc);

-- ============================================
-- Trigger: auto-log status changes
-- ============================================
create or replace function log_application_status_change()
returns trigger as $$
begin
  if OLD.status is distinct from NEW.status then
    insert into public.status_history (application_id, from_status, to_status)
    values (NEW.id, OLD.status, NEW.status);
    NEW.status_updated_at = now();
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger application_status_change
  before update on public.applications
  for each row
  execute function log_application_status_change();

-- ============================================
-- RLS Policies (disabled for single-user, can enable later)
-- ============================================
-- For now, we keep RLS disabled since this is a single-user app.
-- When adding multi-user support, add a user_id column to each table
-- and enable RLS with policies.
