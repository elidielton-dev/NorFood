-- Atribuicao de agente nas conversas Evolution (paridade com waba_conversations)

ALTER TABLE public.whatsapp_chats
  ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_chats_assigned_agent_idx
  ON public.whatsapp_chats (assigned_agent_id);
