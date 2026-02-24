-- Add heard_back_at date to applications for tracking when a response was received
ALTER TABLE public.applications
ADD COLUMN heard_back_at timestamptz DEFAULT NULL;
