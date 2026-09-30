-- 011: Add 'accepted' and 'declined' application statuses
--
-- Both are terminal outcomes of the offer stage: 'accepted' means the user
-- took the offer, 'declined' means the user turned it down (vs 'rejected',
-- where the company turned the user down). The status check constraint is
-- widened, and the status-change trigger maps both to the 'offer' stage so
-- furthest_stage auto-advances correctly.

-- 1. Widen the status check constraint (the inline CHECK is auto-named
--    applications_status_check)
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications
  add constraint applications_status_check
  check (status in ('applied', 'screening', 'interview', 'offer', 'accepted', 'declined', 'rejected', 'ghosted'));

-- 2. Update the trigger: accepted/declined count as having reached 'offer'.
--    Must assign the mapped stage, not NEW.status, or the furthest_stage
--    check constraint would reject the update.
create or replace function log_application_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  stage_order constant text[] := array['applied', 'screening', 'interview', 'offer'];
  new_stage text;
  new_stage_idx int;
  current_stage_idx int;
begin
  if OLD.status is distinct from NEW.status then
    insert into public.status_history (application_id, from_status, to_status, user_id)
    values (NEW.id, OLD.status, NEW.status, NEW.user_id);
    NEW.status_updated_at = now();

    -- Auto-update furthest_stage if new status is a higher progression stage;
    -- accepted/declined are terminal outcomes of the offer stage
    new_stage = case when NEW.status in ('accepted', 'declined') then 'offer' else NEW.status end;
    new_stage_idx := array_position(stage_order, new_stage);
    current_stage_idx := array_position(stage_order, NEW.furthest_stage);
    if new_stage_idx is not null and (current_stage_idx is null or new_stage_idx > current_stage_idx) then
      NEW.furthest_stage = new_stage;
    end if;
  end if;
  return NEW;
end;
$$;
