-- Integracao Quero Delivery por tenant

CREATE TABLE IF NOT EXISTS public.tenant_integrations (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  quero_delivery_enabled BOOLEAN NOT NULL DEFAULT false,
  quero_delivery_place_id TEXT,
  quero_delivery_api_token TEXT,
  quero_delivery_last_poll_at TIMESTAMPTZ,
  quero_delivery_last_event_cursor TEXT,
  quero_delivery_last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quero_delivery_order_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quero_order_id TEXT NOT NULL,
  pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
  last_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, quero_order_id)
);

CREATE INDEX IF NOT EXISTS idx_quero_delivery_order_map_pedido
  ON public.quero_delivery_order_map (pedido_id);

CREATE TABLE IF NOT EXISTS public.quero_delivery_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quero_delivery_sync_logs_tenant
  ON public.quero_delivery_sync_logs (tenant_id, created_at DESC);

GRANT ALL ON public.tenant_integrations TO service_role;
GRANT ALL ON public.quero_delivery_order_map TO service_role;
GRANT ALL ON public.quero_delivery_sync_logs TO service_role;

ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quero_delivery_order_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quero_delivery_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff gerencia tenant_integrations" ON public.tenant_integrations;
CREATE POLICY "staff gerencia tenant_integrations"
  ON public.tenant_integrations FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff le quero_delivery_order_map" ON public.quero_delivery_order_map;
CREATE POLICY "staff le quero_delivery_order_map"
  ON public.quero_delivery_order_map FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff le quero_delivery_sync_logs" ON public.quero_delivery_sync_logs;
CREATE POLICY "staff le quero_delivery_sync_logs"
  ON public.quero_delivery_sync_logs FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
