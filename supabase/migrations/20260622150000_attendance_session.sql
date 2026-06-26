-- Sessao de atendimento: mensagens ativas vs historico em resolvidos

ALTER TABLE public.whatsapp_chats
  ADD COLUMN IF NOT EXISTS attendance_opened_at TIMESTAMPTZ;

ALTER TABLE public.waba_conversations
  ADD COLUMN IF NOT EXISTS attendance_opened_at TIMESTAMPTZ;

UPDATE public.whatsapp_chats
SET attendance_opened_at = COALESCE(first_contact_at, last_message_at, updated_at, now())
WHERE attendance_opened_at IS NULL;

UPDATE public.waba_conversations
SET attendance_opened_at = COALESCE(created_at, last_message_at, updated_at, now())
WHERE attendance_opened_at IS NULL;
