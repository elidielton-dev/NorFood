-- Citacao / resposta em mensagens WhatsApp (Evolution)

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS reply_to_wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_text TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_from_me BOOLEAN;
