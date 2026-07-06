-- Migra provedor WhatsApp Web: evolution -> baileys

ALTER TABLE public.waba_config
  DROP CONSTRAINT IF EXISTS waba_config_active_provider_check;

ALTER TABLE public.waba_config
  ADD CONSTRAINT waba_config_active_provider_check
  CHECK (active_provider IN ('meta', 'baileys', 'evolution'));

UPDATE public.waba_config
SET active_provider = 'baileys'
WHERE active_provider = 'evolution';

UPDATE public.whatsapp_config
SET provider = 'baileys'
WHERE provider = 'evolution' OR provider IS NULL;

ALTER TABLE public.whatsapp_config
  ALTER COLUMN provider SET DEFAULT 'baileys';
