-- Cole no Supabase SQL Editor antes da apresentacao (migrations recentes de atendimento)

ALTER TABLE public.whatsapp_chats
  ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_chats_assigned_agent_idx
  ON public.whatsapp_chats (assigned_agent_id);

ALTER TABLE public.whatsapp_chats
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

ALTER TABLE public.whatsapp_chats
  ADD COLUMN IF NOT EXISTS profile_pic_phone_digits TEXT;

-- Limpa fotos/telefones adivinhados antes do demo
UPDATE public.whatsapp_chats
SET
  profile_pic_url = NULL,
  profile_pic_phone_digits = NULL
WHERE phone IS NOT NULL
  AND profile_pic_phone_digits IS NULL
  AND phone_verified_at IS NULL;
