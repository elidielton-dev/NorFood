-- Realtime para inbox WhatsApp (atualizacao instantanea no painel)

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
