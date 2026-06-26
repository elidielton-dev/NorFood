-- Provedor ativo do Atendimento (Meta Cloud API ou Evolution QR)

ALTER TABLE public.waba_config
  ADD COLUMN IF NOT EXISTS active_provider TEXT NOT NULL DEFAULT 'meta'
    CHECK (active_provider IN ('meta', 'evolution'));

ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;
