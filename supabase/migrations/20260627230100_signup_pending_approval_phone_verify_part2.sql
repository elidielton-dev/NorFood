-- Parte 2/2: colunas, tabela SMS e índices (após enum 'pending' existir)

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.signup_phone_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_digits TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  verification_token TEXT UNIQUE,
  verified_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_phone_verifications_phone_created
  ON public.signup_phone_verifications (phone_digits, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signup_phone_verifications_token
  ON public.signup_phone_verifications (verification_token)
  WHERE verification_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_status_pending
  ON public.tenants (created_at DESC)
  WHERE status = 'pending';

GRANT ALL ON public.signup_phone_verifications TO service_role;
