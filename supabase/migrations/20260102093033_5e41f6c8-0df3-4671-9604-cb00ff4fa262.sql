-- Add question_type to bulk_generation_jobs for better generation tracking
ALTER TABLE public.bulk_generation_jobs 
ADD COLUMN IF NOT EXISTS question_type text DEFAULT 'mixed';

-- Add monologue flag for listening tests
ALTER TABLE public.bulk_generation_jobs 
ADD COLUMN IF NOT EXISTS monologue boolean DEFAULT false;

-- Add question_type to generated_test_audio for filtering
ALTER TABLE public.generated_test_audio 
ADD COLUMN IF NOT EXISTS question_type text DEFAULT 'mixed';

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_generated_test_audio_module_published 
ON public.generated_test_audio(module, is_published);

CREATE INDEX IF NOT EXISTS idx_generated_test_audio_question_type 
ON public.generated_test_audio(question_type);

CREATE INDEX IF NOT EXISTS idx_bulk_generation_jobs_status 
ON public.bulk_generation_jobs(status);