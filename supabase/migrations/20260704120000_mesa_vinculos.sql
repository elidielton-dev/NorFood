-- Mesas vinculadas ao mesmo pedido (juntar mesas)

CREATE TABLE IF NOT EXISTS public.mesa_vinculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  mesa_id UUID NOT NULL REFERENCES public.mesas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mesa_id)
);

CREATE INDEX IF NOT EXISTS idx_mesa_vinculos_pedido ON public.mesa_vinculos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_mesa_vinculos_tenant ON public.mesa_vinculos (tenant_id);

ALTER TABLE public.mesa_vinculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mesa vinculos staff" ON public.mesa_vinculos;
CREATE POLICY "mesa vinculos staff"
  ON public.mesa_vinculos FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

GRANT SELECT, INSERT, DELETE ON public.mesa_vinculos TO authenticated;
GRANT ALL ON public.mesa_vinculos TO service_role;
