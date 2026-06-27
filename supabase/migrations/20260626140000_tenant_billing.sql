-- Norfood — planos, cobrança mensal ou % sobre vendas

CREATE TYPE public.billing_model AS ENUM ('monthly', 'revenue_share');

CREATE TYPE public.billing_plan AS ENUM ('starter', 'pro', 'business');

CREATE TYPE public.billing_invoice_status AS ENUM (
  'draft', 'pending', 'paid', 'waived', 'overdue'
);

CREATE TABLE IF NOT EXISTS public.tenant_billing (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  billing_model public.billing_model NOT NULL DEFAULT 'monthly',
  plan public.billing_plan,
  monthly_price NUMERIC(10, 2),
  revenue_share_percent NUMERIC(5, 2) NOT NULL DEFAULT 2.00,
  revenue_share_min NUMERIC(10, 2) NOT NULL DEFAULT 49.00,
  revenue_share_cap NUMERIC(10, 2) NOT NULL DEFAULT 497.00,
  trial_ends_at TIMESTAMPTZ,
  billing_cycle_day INTEGER NOT NULL DEFAULT 1 CHECK (billing_cycle_day BETWEEN 1 AND 28),
  payment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (payment_status IN ('active', 'overdue', 'paused')),
  accepted_terms_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_billing_plan_check CHECK (
    (billing_model = 'monthly' AND plan IS NOT NULL AND monthly_price IS NOT NULL)
    OR (billing_model = 'revenue_share' AND plan IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.tenant_billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  billing_model public.billing_model NOT NULL,
  plan public.billing_plan,
  gross_sales NUMERIC(12, 2) NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  revenue_share_percent NUMERIC(5, 2),
  calculated_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  final_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status public.billing_invoice_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_tenant_billing_invoices_tenant
  ON public.tenant_billing_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_billing_invoices_period
  ON public.tenant_billing_invoices(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_tenant_billing_invoices_status
  ON public.tenant_billing_invoices(status);

GRANT SELECT ON public.tenant_billing TO authenticated;
GRANT ALL ON public.tenant_billing TO service_role;
GRANT SELECT ON public.tenant_billing_invoices TO authenticated;
GRANT ALL ON public.tenant_billing_invoices TO service_role;

ALTER TABLE public.tenant_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_billing_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant billing owner read" ON public.tenant_billing;
CREATE POLICY "tenant billing owner read"
  ON public.tenant_billing FOR SELECT TO authenticated
  USING (public.is_tenant_manager(tenant_id));

DROP POLICY IF EXISTS "tenant billing invoices owner read" ON public.tenant_billing_invoices;
CREATE POLICY "tenant billing invoices owner read"
  ON public.tenant_billing_invoices FOR SELECT TO authenticated
  USING (public.is_tenant_manager(tenant_id));

DROP TRIGGER IF EXISTS trg_tenant_billing_upd ON public.tenant_billing;
CREATE TRIGGER trg_tenant_billing_upd BEFORE UPDATE ON public.tenant_billing
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_billing_invoices_upd ON public.tenant_billing_invoices;
CREATE TRIGGER trg_tenant_billing_invoices_upd BEFORE UPDATE ON public.tenant_billing_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed billing para tenants demo existentes (trial 14 dias, plano Pro)
INSERT INTO public.tenant_billing (
  tenant_id,
  billing_model,
  plan,
  monthly_price,
  trial_ends_at,
  accepted_terms_at
)
SELECT
  t.id,
  'monthly',
  'pro',
  149.90,
  now() + interval '14 days',
  now()
FROM public.tenants t
WHERE t.slug IN ('norfood', 'demo-restaurante')
ON CONFLICT (tenant_id) DO NOTHING;
