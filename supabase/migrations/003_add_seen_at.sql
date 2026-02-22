-- Add seen_at timestamp to job_listings for tracking which jobs have been viewed
ALTER TABLE public.job_listings
ADD COLUMN seen_at timestamptz DEFAULT NULL;
