-- Add credit tracking columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS daily_credits_used integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reset_date date NOT NULL DEFAULT CURRENT_DATE;

-- Create index for efficient date lookups
CREATE INDEX IF NOT EXISTS idx_profiles_last_reset_date ON public.profiles(last_reset_date);