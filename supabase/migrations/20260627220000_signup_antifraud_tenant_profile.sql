-- Cadastro anti-abuso: documento (CNPJ/CPF), CEP, verificação de pagamento, rate limit

CREATE TYPE public.tenant_document_type AS ENUM ('cnpj', 'cpf');

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS document_type public.tenant_document_type,
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS street TEXT,
  ADD COLUMN IF NOT EXISTS street_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_document_number
  ON public.tenants (document_number)
  WHERE document_number IS NOT NULL AND document_number <> '';

ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS address_number TEXT;

ALTER TABLE public.tenant_billing
  ADD COLUMN IF NOT EXISTS signup_payment_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signup_mp_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS signup_mp_preference_id TEXT,
  ADD COLUMN IF NOT EXISTS signup_mp_checkout_url TEXT,
  ADD COLUMN IF NOT EXISTS signup_mp_pix_qr_code TEXT,
  ADD COLUMN IF NOT EXISTS signup_mp_pix_qr_base64 TEXT;

ALTER TABLE public.tenant_billing DROP CONSTRAINT IF EXISTS tenant_billing_payment_status_check;
ALTER TABLE public.tenant_billing
  ADD CONSTRAINT tenant_billing_payment_status_check
  CHECK (payment_status IN ('active', 'overdue', 'paused', 'pending_verification'));

CREATE TABLE IF NOT EXISTS public.signup_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_rate_limits_ip_created
  ON public.signup_rate_limits (ip_hash, created_at DESC);

GRANT ALL ON public.signup_rate_limits TO service_role;

-- Tenants existentes (norfood, demo): não exigir revalidação de pagamento
UPDATE public.tenant_billing
SET
  signup_payment_verified_at = COALESCE(signup_payment_verified_at, now()),
  payment_status = CASE
    WHEN payment_status = 'pending_verification' THEN 'active'
    ELSE payment_status
  END,
  updated_at = now()
WHERE signup_payment_verified_at IS NULL;

-- Loja/painel: tenants em trial também visíveis (suspended continua oculto na loja pública)
DROP POLICY IF EXISTS "tenants public read active" ON public.tenants;
CREATE POLICY "tenants public read active"
  ON public.tenants FOR SELECT
  USING (status IN ('active', 'trial'));
