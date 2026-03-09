-- Guidepost: Complete Database Setup
-- Run this in Supabase SQL Editor to create all tables from scratch.
-- This is the consolidated schema including all migrations.

-- ============================================
-- Resumes
-- ============================================
create table if not exists public.resumes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  file_path text not null,
  file_name text not null,
  uploaded_at timestamptz default now() not null,
  parsed_data jsonb,
  is_active boolean default true not null
);

-- ============================================
-- Search Filters (per resume)
-- ============================================
create table if not exists public.search_filters (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  resume_id uuid references public.resumes(id) on delete cascade not null,
  keywords text[] default '{}',
  location text,
  remote_preference text default 'any' check (remote_preference in ('remote', 'hybrid', 'onsite', 'any')),
  target_seniority text default 'any' not null check (target_seniority in ('entry', 'mid', 'senior', 'any')),
  min_salary integer,
  max_listing_age_days integer default 7,
  excluded_companies text[] default '{}'
);

create unique index if not exists search_filters_resume_id_idx on public.search_filters(resume_id);

-- ============================================
-- Job Listings
-- ============================================
create table if not exists public.job_listings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
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
  is_remote boolean default false,
  seen_at timestamptz default null
);

create index if not exists job_listings_status_score_idx on public.job_listings(status, match_score desc);
create unique index if not exists job_listings_url_idx on public.job_listings(url) where url is not null;

-- ============================================
-- Applications
-- ============================================
create table if not exists public.applications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  job_listing_id uuid references public.job_listings(id) on delete set null,
  job_title text not null,
  company text not null,
  applied_at date default current_date not null,
  applied_via text,
  status text default 'applied' check (status in ('applied', 'screening', 'interview', 'offer', 'rejected', 'ghosted')),
  status_updated_at timestamptz default now() not null,
  heard_back_at timestamptz default null,
  notes text,
  url text,
  furthest_stage text default 'applied' not null check (furthest_stage in ('applied', 'screening', 'interview', 'offer'))
);

create index if not exists applications_status_idx on public.applications(status);
create index if not exists applications_applied_at_idx on public.applications(applied_at desc);

-- ============================================
-- Status History (for tracking timeline)
-- ============================================
create table if not exists public.status_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  application_id uuid references public.applications(id) on delete cascade not null,
  from_status text,
  to_status text not null,
  changed_at timestamptz default now() not null
);

create index if not exists status_history_app_idx on public.status_history(application_id, changed_at desc);

-- ============================================
-- Trigger: auto-log status changes
-- ============================================
create or replace function log_application_status_change()
returns trigger as $$
declare
  stage_order constant text[] := array['applied', 'screening', 'interview', 'offer'];
  new_stage_idx int;
  current_stage_idx int;
begin
  if OLD.status is distinct from NEW.status then
    insert into public.status_history (application_id, from_status, to_status, user_id)
    values (NEW.id, OLD.status, NEW.status, NEW.user_id);
    NEW.status_updated_at = now();

    -- Auto-update furthest_stage if new status is a higher progression stage
    new_stage_idx := array_position(stage_order, NEW.status);
    current_stage_idx := array_position(stage_order, NEW.furthest_stage);
    if new_stage_idx is not null and (current_stage_idx is null or new_stage_idx > current_stage_idx) then
      NEW.furthest_stage = NEW.status;
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists application_status_change on public.applications;
create trigger application_status_change
  before update on public.applications
  for each row
  execute function log_application_status_change();

-- ============================================
-- Row Level Security
-- ============================================
alter table public.resumes enable row level security;
alter table public.search_filters enable row level security;
alter table public.job_listings enable row level security;
alter table public.applications enable row level security;
alter table public.status_history enable row level security;

-- Resumes
create policy "Users can view their own resumes" on public.resumes for select using (auth.uid() = user_id);
create policy "Users can insert their own resumes" on public.resumes for insert with check (auth.uid() = user_id);
create policy "Users can update their own resumes" on public.resumes for update using (auth.uid() = user_id);
create policy "Users can delete their own resumes" on public.resumes for delete using (auth.uid() = user_id);

-- Search Filters
create policy "Users can view their own search_filters" on public.search_filters for select using (auth.uid() = user_id);
create policy "Users can insert their own search_filters" on public.search_filters for insert with check (auth.uid() = user_id);
create policy "Users can update their own search_filters" on public.search_filters for update using (auth.uid() = user_id);
create policy "Users can delete their own search_filters" on public.search_filters for delete using (auth.uid() = user_id);

-- Job Listings
create policy "Users can view their own job_listings" on public.job_listings for select using (auth.uid() = user_id);
create policy "Users can insert their own job_listings" on public.job_listings for insert with check (auth.uid() = user_id);
create policy "Users can update their own job_listings" on public.job_listings for update using (auth.uid() = user_id);
create policy "Users can delete their own job_listings" on public.job_listings for delete using (auth.uid() = user_id);

-- Applications
create policy "Users can view their own applications" on public.applications for select using (auth.uid() = user_id);
create policy "Users can insert their own applications" on public.applications for insert with check (auth.uid() = user_id);
create policy "Users can update their own applications" on public.applications for update using (auth.uid() = user_id);
create policy "Users can delete their own applications" on public.applications for delete using (auth.uid() = user_id);

-- Status History
create policy "Users can view their own status_history" on public.status_history for select using (auth.uid() = user_id);
create policy "Users can insert their own status_history" on public.status_history for insert with check (auth.uid() = user_id);
create policy "Users can update their own status_history" on public.status_history for update using (auth.uid() = user_id);
create policy "Users can delete their own status_history" on public.status_history for delete using (auth.uid() = user_id);
