-- Coexistência: WhatsApp Business App + Cloud API no mesmo número

ALTER TABLE public.waba_config
  ADD COLUMN IF NOT EXISTS coexistence_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_on_biz_app BOOLEAN,
  ADD COLUMN IF NOT EXISTS platform_type TEXT,
  ADD COLUMN IF NOT EXISTS coexistence_contacts_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coexistence_history_synced_at TIMESTAMPTZ;
