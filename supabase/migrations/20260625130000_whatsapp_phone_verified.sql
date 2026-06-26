-- Telefone confirmado manualmente ou via mensagem (evita envio para numero adivinhado por nome)

ALTER TABLE public.whatsapp_chats
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
