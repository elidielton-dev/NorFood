-- CRM de leads para revendedoras (portal parceiro)

CREATE TYPE public.reseller_lead_status AS ENUM (
  'novo',
  'contato',
  'demo',
  'proposta',
  'ganho',
  'perdido'
);

CREATE TABLE IF NOT EXISTS public.reseller_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  company_name TEXT,
  status public.reseller_lead_status NOT NULL DEFAULT 'novo',
  source TEXT DEFAULT 'manual',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reseller_leads_reseller ON public.reseller_leads (reseller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reseller_leads_status ON public.reseller_leads (reseller_id, status);

DROP TRIGGER IF EXISTS trg_reseller_leads_upd ON public.reseller_leads;
CREATE TRIGGER trg_reseller_leads_upd BEFORE UPDATE ON public.reseller_leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.reseller_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reseller leads read own org" ON public.reseller_leads;
CREATE POLICY "reseller leads read own org"
  ON public.reseller_leads FOR SELECT TO authenticated
  USING (reseller_id IN (SELECT public.user_reseller_ids()));

GRANT SELECT ON public.reseller_leads TO authenticated;
GRANT ALL ON public.reseller_leads TO service_role;
