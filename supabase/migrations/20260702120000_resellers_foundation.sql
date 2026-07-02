-- Revendedoras (hiperadores), tokens de ativacao, billing e impersonate

CREATE TYPE public.reseller_status AS ENUM ('active', 'suspended', 'pending_setup');

CREATE TYPE public.reseller_user_role AS ENUM ('owner', 'admin', 'support');

CREATE TYPE public.activation_token_status AS ENUM ('active', 'consumed', 'expired', 'revoked');

CREATE TYPE public.billing_payment_source AS ENUM ('platform', 'reseller');

CREATE TYPE public.impersonation_actor_type AS ENUM ('reseller', 'platform');

CREATE TABLE IF NOT EXISTS public.resellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  document_number TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  logo_url TEXT,
  status public.reseller_status NOT NULL DEFAULT 'pending_setup',
  max_tenants INTEGER NOT NULL DEFAULT 10 CHECK (max_tenants > 0),
  allowed_plans public.billing_plan[] NOT NULL DEFAULT '{starter,pro}',
  price_per_tenant NUMERIC(10, 2),
  flat_monthly_fee NUMERIC(10, 2),
  default_trial_days INTEGER NOT NULL DEFAULT 14,
  notes TEXT,
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reseller_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.reseller_user_role NOT NULL DEFAULT 'support',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.activation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  plan public.billing_plan NOT NULL,
  trial_days INTEGER NOT NULL DEFAULT 14,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  uses_count INTEGER NOT NULL DEFAULT 0,
  status public.activation_token_status NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (uses_count <= max_uses)
);

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS reseller_id UUID REFERENCES public.resellers(id),
  ADD COLUMN IF NOT EXISTS activation_token_id UUID REFERENCES public.activation_tokens(id),
  ADD COLUMN IF NOT EXISTS onboarded_by UUID REFERENCES auth.users(id);

ALTER TABLE public.tenant_billing
  ADD COLUMN IF NOT EXISTS payment_source public.billing_payment_source NOT NULL DEFAULT 'platform';

CREATE TABLE IF NOT EXISTS public.reseller_billing (
  reseller_id UUID PRIMARY KEY REFERENCES public.resellers(id) ON DELETE CASCADE,
  billing_cycle_day INTEGER NOT NULL DEFAULT 1 CHECK (billing_cycle_day BETWEEN 1 AND 28),
  payment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (payment_status IN ('active', 'overdue', 'paused')),
  price_per_tenant NUMERIC(10, 2),
  flat_monthly_fee NUMERIC(10, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reseller_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  active_tenant_count INTEGER NOT NULL DEFAULT 0,
  calculated_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  final_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status public.billing_invoice_status NOT NULL DEFAULT 'draft',
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS public.impersonation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type public.impersonation_actor_type NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id),
  reseller_id UUID REFERENCES public.resellers(id),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_resellers_status ON public.resellers (status);
CREATE INDEX IF NOT EXISTS idx_reseller_users_user ON public.reseller_users (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_tenants_reseller ON public.tenants (reseller_id) WHERE reseller_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activation_tokens_reseller ON public.activation_tokens (reseller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activation_tokens_status ON public.activation_tokens (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_impersonation_tenant ON public.impersonation_logs (tenant_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.user_reseller_ids()
RETURNS SETOF UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT reseller_id FROM public.reseller_users
  WHERE user_id = auth.uid() AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.tg_tenants_reseller_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.reseller_id IS DISTINCT FROM NEW.reseller_id THEN
    RAISE EXCEPTION 'reseller_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_reseller_immutable ON public.tenants;
CREATE TRIGGER trg_tenants_reseller_immutable
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_tenants_reseller_immutable();

DROP TRIGGER IF EXISTS trg_resellers_upd ON public.resellers;
CREATE TRIGGER trg_resellers_upd BEFORE UPDATE ON public.resellers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_reseller_users_upd ON public.reseller_users;
CREATE TRIGGER trg_reseller_users_upd BEFORE UPDATE ON public.reseller_users
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_activation_tokens_upd ON public.activation_tokens;
CREATE TRIGGER trg_activation_tokens_upd BEFORE UPDATE ON public.activation_tokens
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_reseller_billing_upd ON public.reseller_billing;
CREATE TRIGGER trg_reseller_billing_upd BEFORE UPDATE ON public.reseller_billing
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_reseller_invoices_upd ON public.reseller_invoices;
CREATE TRIGGER trg_reseller_invoices_upd BEFORE UPDATE ON public.reseller_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT ON public.resellers TO authenticated;
GRANT ALL ON public.resellers TO service_role;
GRANT SELECT ON public.reseller_users TO authenticated;
GRANT ALL ON public.reseller_users TO service_role;
GRANT ALL ON public.activation_tokens TO service_role;
GRANT ALL ON public.reseller_billing TO service_role;
GRANT ALL ON public.reseller_invoices TO service_role;
GRANT ALL ON public.impersonation_logs TO service_role;

ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reseller users read own membership" ON public.reseller_users;
CREATE POLICY "reseller users read own membership"
  ON public.reseller_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "resellers read own org" ON public.resellers;
CREATE POLICY "resellers read own org"
  ON public.resellers FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_reseller_ids()));
