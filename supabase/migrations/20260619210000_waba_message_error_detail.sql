-- Detalhe de erro de entrega Meta (webhook statuses.errors)
ALTER TABLE public.waba_messages
  ADD COLUMN IF NOT EXISTS error_detail TEXT;
