-- Meta WhatsApp Cloud API — módulo Atendimento (Abelha & Mel)
-- Tabelas separadas do inbox Evolution (whatsapp_chats / whatsapp_messages).

CREATE TABLE IF NOT EXISTS public.waba_workspace (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL DEFAULT 'Abelha & Mel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.waba_workspace (id, name)
VALUES ('default', 'Abelha & Mel')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.waba_config (
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES public.waba_workspace(id) ON DELETE CASCADE,
  phone_number_id TEXT,
  waba_id TEXT,
  access_token TEXT,
  verify_token TEXT,
  display_phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  connected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id)
);

CREATE TABLE IF NOT EXISTS public.waba_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES public.waba_workspace(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  phone_normalized TEXT GENERATED ALWAYS AS (regexp_replace(phone, '[^0-9]', '', 'g')) STORED,
  name TEXT,
  email TEXT,
  company TEXT,
  avatar_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, phone_normalized)
);

CREATE INDEX IF NOT EXISTS waba_contacts_workspace_idx ON public.waba_contacts (workspace_id);

CREATE TABLE IF NOT EXISTS public.waba_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES public.waba_workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b8f71',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS public.waba_contact_tags (
  contact_id UUID NOT NULL REFERENCES public.waba_contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.waba_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.waba_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES public.waba_workspace(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  field_options JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, field_name)
);

CREATE TABLE IF NOT EXISTS public.waba_contact_custom_values (
  contact_id UUID NOT NULL REFERENCES public.waba_contacts(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES public.waba_custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  PRIMARY KEY (contact_id, custom_field_id)
);

CREATE TABLE IF NOT EXISTS public.waba_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES public.waba_workspace(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.waba_contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, contact_id)
);

CREATE INDEX IF NOT EXISTS waba_conversations_last_msg_idx
  ON public.waba_conversations (workspace_id, last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.waba_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.waba_conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent', 'bot')),
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL DEFAULT 'text'
    CHECK (content_type IN ('text', 'image', 'document', 'audio', 'video', 'location', 'template')),
  content_text TEXT,
  media_url TEXT,
  template_name TEXT,
  wa_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waba_messages_conversation_idx
  ON public.waba_messages (conversation_id, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS waba_messages_wa_id_idx
  ON public.waba_messages (wa_message_id) WHERE wa_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.waba_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES public.waba_workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'UTILITY',
  language TEXT NOT NULL DEFAULT 'pt_BR',
  body_text TEXT NOT NULL,
  header_type TEXT,
  header_content TEXT,
  footer_text TEXT,
  buttons JSONB,
  status TEXT NOT NULL DEFAULT 'Draft',
  meta_template_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name, language)
);

CREATE TABLE IF NOT EXISTS public.waba_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL DEFAULT 'default' REFERENCES public.waba_workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  execution_count INTEGER NOT NULL DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waba_automations_active_idx
  ON public.waba_automations (workspace_id, trigger_type) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.waba_automation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES public.waba_automations(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES public.waba_automation_steps(id) ON DELETE CASCADE,
  branch TEXT CHECK (branch IN ('yes', 'no')),
  step_type TEXT NOT NULL,
  step_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.waba_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES public.waba_automations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.waba_contacts(id) ON DELETE SET NULL,
  trigger_event TEXT NOT NULL,
  steps_executed JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: equipe (is_staff) acessa o workspace único da loja
ALTER TABLE public.waba_workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waba_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waba_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waba_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waba_contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waba_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waba_contact_custom_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waba_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waba_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waba_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waba_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waba_automation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waba_automation_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'waba_workspace', 'waba_config', 'waba_contacts', 'waba_tags', 'waba_contact_tags',
    'waba_custom_fields', 'waba_contact_custom_values', 'waba_conversations', 'waba_messages',
    'waba_message_templates', 'waba_automations', 'waba_automation_steps', 'waba_automation_logs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "staff waba all" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "staff waba all" ON public.%I FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()))',
      t
    );
  END LOOP;
END $$;

-- Realtime para inbox (ignora se ja publicado)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.waba_conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.waba_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
