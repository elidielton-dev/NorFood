-- Escopo multi-tenant para módulo fiscal (P0 segurança)

ALTER TABLE public.empresa_fiscal
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.fiscal_config
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

UPDATE public.notas_fiscais nf
SET tenant_id = p.tenant_id
FROM public.pedidos p
WHERE nf.pedido_id = p.id
  AND nf.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS empresa_fiscal_tenant_id_uidx
  ON public.empresa_fiscal (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_config_tenant_id_uidx
  ON public.fiscal_config (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notas_fiscais_tenant_id_idx
  ON public.notas_fiscais (tenant_id);

DROP POLICY IF EXISTS "staff gerencia notas fiscais" ON public.notas_fiscais;
CREATE POLICY "tenant staff gerencia notas fiscais"
  ON public.notas_fiscais FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS "staff gerencia empresa fiscal" ON public.empresa_fiscal;
CREATE POLICY "tenant staff gerencia empresa fiscal"
  ON public.empresa_fiscal FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS "staff gerencia fiscal config" ON public.fiscal_config;
CREATE POLICY "tenant staff gerencia fiscal config"
  ON public.fiscal_config FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id));
