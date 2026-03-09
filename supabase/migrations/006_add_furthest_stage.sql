-- Migration: Add furthest_stage column to applications
-- Run this in the Supabase SQL Editor to add the column to your existing database.

-- 1. Add the column
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS furthest_stage text DEFAULT 'applied' NOT NULL 
CHECK (furthest_stage IN ('applied', 'screening', 'interview', 'offer'));

-- 2. Backfill: set furthest_stage for apps currently in a progression stage
UPDATE public.applications 
SET furthest_stage = status 
WHERE status IN ('screening', 'interview', 'offer');

-- 3. Update the trigger to auto-maintain furthest_stage
CREATE OR REPLACE FUNCTION log_application_status_change()
RETURNS trigger AS $$
DECLARE
  stage_order CONSTANT text[] := ARRAY['applied', 'screening', 'interview', 'offer'];
  new_stage_idx int;
  current_stage_idx int;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.status_history (application_id, from_status, to_status, user_id)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.user_id);
    NEW.status_updated_at = now();

    -- Auto-update furthest_stage if new status is a higher progression stage
    new_stage_idx := array_position(stage_order, NEW.status);
    current_stage_idx := array_position(stage_order, NEW.furthest_stage);
    IF new_stage_idx IS NOT NULL AND (current_stage_idx IS NULL OR new_stage_idx > current_stage_idx) THEN
      NEW.furthest_stage = NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
