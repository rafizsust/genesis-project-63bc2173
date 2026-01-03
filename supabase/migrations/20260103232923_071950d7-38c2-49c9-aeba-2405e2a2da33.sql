-- Re-run backfill for any remaining listening preset tests missing audio_url
UPDATE public.ai_practice_tests apt
SET audio_url = gta.audio_url
FROM public.generated_test_audio gta
WHERE apt.module = 'listening'
  AND apt.audio_url IS NULL
  AND apt.payload->>'isPreset' = 'true'
  AND apt.payload->>'presetId' IS NOT NULL
  AND gta.id = (apt.payload->>'presetId')::uuid
  AND gta.audio_url IS NOT NULL;