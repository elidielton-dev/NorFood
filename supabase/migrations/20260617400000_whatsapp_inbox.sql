-- WhatsApp inbox (Evolution API sync)

CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  instance_name TEXT NOT NULL DEFAULT 'abelha-mel',
  status TEXT NOT NULL DEFAULT 'disconnected',
  phone_number TEXT,
  profile_name TEXT,
  qr_code TEXT,
  provider TEXT NOT NULL DEFAULT 'evolution',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.whatsapp_config (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.whatsapp_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_jid TEXT NOT NULL UNIQUE,
  phone TEXT,
  name TEXT,
  profile_pic_url TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  cliente_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_group BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_chats_last_message_idx
  ON public.whatsapp_chats (last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE,
  remote_jid TEXT NOT NULL,
  wa_message_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  media_url TEXT,
  media_mime TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wa_message_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_chat_sent_idx
  ON public.whatsapp_messages (chat_id, sent_at DESC);

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff le whatsapp config" ON public.whatsapp_config;
CREATE POLICY "staff le whatsapp config"
  ON public.whatsapp_config FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff le whatsapp chats" ON public.whatsapp_chats;
CREATE POLICY "staff le whatsapp chats"
  ON public.whatsapp_chats FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff le whatsapp messages" ON public.whatsapp_messages;
CREATE POLICY "staff le whatsapp messages"
  ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
