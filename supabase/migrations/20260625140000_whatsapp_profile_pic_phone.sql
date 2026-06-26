-- Foto de perfil so vale para o telefone confirmado (evita avatar de homonimo)

ALTER TABLE public.whatsapp_chats
  ADD COLUMN IF NOT EXISTS profile_pic_phone_digits TEXT;
