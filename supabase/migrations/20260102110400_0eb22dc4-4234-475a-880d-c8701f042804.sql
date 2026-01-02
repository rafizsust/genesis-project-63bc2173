-- Allow admin cancellation by extending the job status CHECK constraint
ALTER TABLE public.bulk_generation_jobs
  DROP CONSTRAINT IF EXISTS bulk_generation_jobs_status_check;

ALTER TABLE public.bulk_generation_jobs
  ADD CONSTRAINT bulk_generation_jobs_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));
