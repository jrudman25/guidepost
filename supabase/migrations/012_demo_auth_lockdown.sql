-- 012: Lock the public demo account's auth credentials
--
-- The demo password is public, and the Supabase Auth API (/auth/v1/user) sits
-- outside the app proxy and table RLS. Without this, any guest can call
-- supabase.auth.updateUser() to change the password (locking out other
-- guests) or the email (which would also drop the email-keyed demo
-- restrictions from migration 009). These triggers reject credential,
-- contact, and metadata changes on the demo user and block MFA enrollment.
-- Sign-in bookkeeping columns (last_sign_in_at, updated_at, etc.) are not
-- checked, so guest sign-in keeps working.
--
-- Triggers fire for every role, including Auth admin API calls from the
-- dashboard. To intentionally change the demo account, run in the SQL editor:
--   begin;
--   set local guidepost.allow_demo_account_changes = 'on';
--   update auth.users set ... where email = 'demo@guidepostai.app';
--   commit;

create or replace function public.guard_demo_account_auth_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if OLD.email = 'demo@guidepostai.app'
     and coalesce(current_setting('guidepost.allow_demo_account_changes', true), '') <> 'on'
     and (
       NEW.email is distinct from OLD.email
       or NEW.encrypted_password is distinct from OLD.encrypted_password
       or NEW.email_change is distinct from OLD.email_change
       or NEW.phone is distinct from OLD.phone
       or NEW.phone_change is distinct from OLD.phone_change
       or NEW.raw_user_meta_data is distinct from OLD.raw_user_meta_data
     ) then
    raise exception 'The demo account cannot be modified'
      using errcode = 'insufficient_privilege';
  end if;
  return NEW;
end;
$$;

create or replace function public.guard_demo_mfa_enrollment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('guidepost.allow_demo_account_changes', true), '') <> 'on'
     and exists (
       select 1 from auth.users
       where id = NEW.user_id and email = 'demo@guidepostai.app'
     ) then
    raise exception 'The demo account cannot enroll MFA factors'
      using errcode = 'insufficient_privilege';
  end if;
  return NEW;
end;
$$;

-- Trigger functions are never meant to be called directly (and are not
-- exposed as RPC), but keep them off the API roles anyway.
revoke execute on function public.guard_demo_account_auth_changes() from public, anon, authenticated;
revoke execute on function public.guard_demo_mfa_enrollment() from public, anon, authenticated;

drop trigger if exists guard_demo_account_auth_changes on auth.users;
create trigger guard_demo_account_auth_changes
  before update on auth.users
  for each row
  execute function public.guard_demo_account_auth_changes();

drop trigger if exists guard_demo_mfa_enrollment on auth.mfa_factors;
create trigger guard_demo_mfa_enrollment
  before insert on auth.mfa_factors
  for each row
  execute function public.guard_demo_mfa_enrollment();
