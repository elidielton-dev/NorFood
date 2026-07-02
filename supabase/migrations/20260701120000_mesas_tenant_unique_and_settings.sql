-- Mesas por tenant (numero unico dentro do restaurante, nao global)
ALTER TABLE public.mesas DROP CONSTRAINT IF EXISTS mesas_numero_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mesas_tenant_numero
  ON public.mesas (tenant_id, numero)
  WHERE tenant_id IS NOT NULL;

-- Backfill tenant_id em mesas legadas sem tenant (demo norfood)
UPDATE public.mesas
SET tenant_id = 'a0000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;
