-- 005_multi_tenant_rls.sql
-- Add user_id column to existing tables and enable Row Level Security (RLS)

-- 1. Add user_id column to existing tables (allow null temporarily to assign existing rows)
alter table public.resumes add column user_id uuid references auth.users(id) on delete cascade;
alter table public.search_filters add column user_id uuid references auth.users(id) on delete cascade;
alter table public.job_listings add column user_id uuid references auth.users(id) on delete cascade;
alter table public.applications add column user_id uuid references auth.users(id) on delete cascade;
alter table public.status_history add column user_id uuid references auth.users(id) on delete cascade;

-- Assign missing user_id on existing recovered records to the primary non-demo user
do $$ 
declare
    primary_user_id uuid;
begin
    select id into primary_user_id from auth.users where email != 'demo@guidepostai.app' limit 1;

    if primary_user_id is not null then
        update public.resumes set user_id = primary_user_id where user_id is null;
        update public.search_filters set user_id = primary_user_id where user_id is null;
        update public.job_listings set user_id = primary_user_id where user_id is null;
        update public.applications set user_id = primary_user_id where user_id is null;
    end if;
end $$;

-- Enforce default and NOT NULL constraints
alter table public.resumes alter column user_id set default auth.uid();
alter table public.resumes alter column user_id set not null;

alter table public.search_filters alter column user_id set default auth.uid();
alter table public.search_filters alter column user_id set not null;

alter table public.job_listings alter column user_id set default auth.uid();
alter table public.job_listings alter column user_id set not null;

alter table public.applications alter column user_id set default auth.uid();
alter table public.applications alter column user_id set not null;

update public.status_history 
set user_id = a.user_id 
from public.applications a 
where public.status_history.application_id = a.id and public.status_history.user_id is null;

alter table public.status_history alter column user_id set default auth.uid();


-- 2. ENABLE RLS
alter table public.resumes enable row level security;
alter table public.search_filters enable row level security;
alter table public.job_listings enable row level security;
alter table public.applications enable row level security;
alter table public.status_history enable row level security;

-- 3. CREATE POLICIES (Limit users to only interact with their own data)
create policy "Users can view their own resumes" on public.resumes for select using (auth.uid() = user_id);
create policy "Users can insert their own resumes" on public.resumes for insert with check (auth.uid() = user_id);
create policy "Users can update their own resumes" on public.resumes for update using (auth.uid() = user_id);
create policy "Users can delete their own resumes" on public.resumes for delete using (auth.uid() = user_id);

create policy "Users can view their own search_filters" on public.search_filters for select using (auth.uid() = user_id);
create policy "Users can insert their own search_filters" on public.search_filters for insert with check (auth.uid() = user_id);
create policy "Users can update their own search_filters" on public.search_filters for update using (auth.uid() = user_id);
create policy "Users can delete their own search_filters" on public.search_filters for delete using (auth.uid() = user_id);

create policy "Users can view their own job_listings" on public.job_listings for select using (auth.uid() = user_id);
create policy "Users can insert their own job_listings" on public.job_listings for insert with check (auth.uid() = user_id);
create policy "Users can update their own job_listings" on public.job_listings for update using (auth.uid() = user_id);
create policy "Users can delete their own job_listings" on public.job_listings for delete using (auth.uid() = user_id);

create policy "Users can view their own applications" on public.applications for select using (auth.uid() = user_id);
create policy "Users can insert their own applications" on public.applications for insert with check (auth.uid() = user_id);
create policy "Users can update their own applications" on public.applications for update using (auth.uid() = user_id);
create policy "Users can delete their own applications" on public.applications for delete using (auth.uid() = user_id);

create policy "Users can view their own status_history" on public.status_history for select using (auth.uid() = user_id);
create policy "Users can insert their own status_history" on public.status_history for insert with check (auth.uid() = user_id);
create policy "Users can update their own status_history" on public.status_history for update using (auth.uid() = user_id);
create policy "Users can delete their own status_history" on public.status_history for delete using (auth.uid() = user_id);
