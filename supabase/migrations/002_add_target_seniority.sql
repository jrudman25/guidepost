-- Add target_seniority column to search_filters
ALTER TABLE public.search_filters
ADD COLUMN target_seniority text NOT NULL DEFAULT 'any'
CHECK (target_seniority IN ('entry', 'mid', 'senior', 'any'));
