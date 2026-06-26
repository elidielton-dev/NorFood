-- Retencao de 7 dias e marco do primeiro contato no inbox WhatsApp

ALTER TABLE public.whatsapp_chats
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ;

UPDATE public.whatsapp_chats
SET first_contact_at = now()
WHERE first_contact_at IS NULL;

CREATE INDEX IF NOT EXISTS whatsapp_chats_retention_idx
  ON public.whatsapp_chats (last_message_at DESC NULLS LAST)
  WHERE last_message_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_messages_sent_at_idx
  ON public.whatsapp_messages (sent_at DESC);
