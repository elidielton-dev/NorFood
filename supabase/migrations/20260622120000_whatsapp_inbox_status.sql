-- Status da conversa no inbox Evolution (aberta / pendente / encerrada)

ALTER TABLE public.whatsapp_chats
  ADD COLUMN IF NOT EXISTS inbox_status TEXT NOT NULL DEFAULT 'open'
  CHECK (inbox_status IN ('open', 'pending', 'closed'));

CREATE INDEX IF NOT EXISTS whatsapp_chats_inbox_status_idx
  ON public.whatsapp_chats (inbox_status);
