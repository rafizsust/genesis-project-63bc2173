-- Create api_keys table for managing AI provider keys with rotation
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  key_value TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  error_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on api_keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Admin-only access for api_keys
CREATE POLICY "Admins can manage api_keys"
ON public.api_keys
FOR ALL
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Create test_presets table for storing pre-generated test content
CREATE TABLE public.test_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on test_presets
ALTER TABLE public.test_presets ENABLE ROW LEVEL SECURITY;

-- Admin can do everything on test_presets
CREATE POLICY "Admins can manage test_presets"
ON public.test_presets
FOR ALL
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Public can view published test_presets
CREATE POLICY "Anyone can view published test_presets"
ON public.test_presets
FOR SELECT
USING (is_published = true);

-- Trigger for updated_at on api_keys
CREATE TRIGGER update_api_keys_updated_at
BEFORE UPDATE ON public.api_keys
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on test_presets
CREATE TRIGGER update_test_presets_updated_at
BEFORE UPDATE ON public.test_presets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();