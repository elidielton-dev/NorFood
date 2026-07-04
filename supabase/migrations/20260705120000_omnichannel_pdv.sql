-- PDV omnichannel: endereços de clientes + rastreio de origem nos pedidos

CREATE TABLE IF NOT EXISTS public.cliente_enderecos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  waba_contact_id UUID REFERENCES public.waba_contacts(id) ON DELETE SET NULL,
  telefone TEXT,
  label TEXT DEFAULT 'Principal',
  endereco TEXT NOT NULL,
  numero TEXT,
  complemento TEXT,
  bairro TEXT NOT NULL,
  cidade TEXT NOT NULL DEFAULT '',
  estado TEXT DEFAULT '',
  cep TEXT,
  referencia TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_enderecos_tenant ON public.cliente_enderecos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cliente_enderecos_cliente ON public.cliente_enderecos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_enderecos_waba ON public.cliente_enderecos (waba_contact_id);
CREATE INDEX IF NOT EXISTS idx_cliente_enderecos_telefone ON public.cliente_enderecos (tenant_id, telefone);

ALTER TABLE public.cliente_enderecos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente enderecos staff" ON public.cliente_enderecos;
CREATE POLICY "cliente enderecos staff"
  ON public.cliente_enderecos FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) OR (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id)))
  WITH CHECK (public.is_staff(auth.uid()) OR (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_enderecos TO authenticated;
GRANT ALL ON public.cliente_enderecos TO service_role;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS origem_venda TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_chat_id UUID,
  ADD COLUMN IF NOT EXISTS waba_contact_id UUID,
  ADD COLUMN IF NOT EXISTS modo_entrega TEXT,
  ADD COLUMN IF NOT EXISTS endereco_id UUID REFERENCES public.cliente_enderecos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_origem_venda ON public.pedidos (tenant_id, origem_venda);
CREATE INDEX IF NOT EXISTS idx_pedidos_whatsapp_chat ON public.pedidos (whatsapp_chat_id);
