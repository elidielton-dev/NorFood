-- Corrige PK de horarios_funcionamento para suportar multitenant (tenant_id + dia_semana)

-- 1) Atribuir seeds globais ao tenant default Norfood
UPDATE public.horarios_funcionamento
SET tenant_id = 'a0000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

-- 2) Copiar horarios para tenants sem grade propria
INSERT INTO public.horarios_funcionamento (tenant_id, dia_semana, ativo, abre, fecha, updated_at)
SELECT
  t.id,
  h.dia_semana,
  h.ativo,
  h.abre,
  h.fecha,
  now()
FROM public.tenants t
CROSS JOIN public.horarios_funcionamento h
WHERE h.tenant_id = 'a0000000-0000-4000-8000-000000000001'
  AND t.id <> 'a0000000-0000-4000-8000-000000000001'
  AND NOT EXISTS (
    SELECT 1
    FROM public.horarios_funcionamento existing
    WHERE existing.tenant_id = t.id
      AND existing.dia_semana = h.dia_semana
  )
ON CONFLICT DO NOTHING;

-- 3) Garantir tenant_id NOT NULL
ALTER TABLE public.horarios_funcionamento
  ALTER COLUMN tenant_id SET NOT NULL;

-- 4) Trocar PK de dia_semana para (tenant_id, dia_semana)
ALTER TABLE public.horarios_funcionamento
  DROP CONSTRAINT IF EXISTS horarios_funcionamento_pkey;

ALTER TABLE public.horarios_funcionamento
  ADD CONSTRAINT horarios_funcionamento_pkey PRIMARY KEY (tenant_id, dia_semana);

CREATE INDEX IF NOT EXISTS idx_horarios_tenant ON public.horarios_funcionamento (tenant_id);

-- 5) attendance_close_marker por tenant em config_operacional (se ainda nao existir coluna tenant no marker flow)
-- Marker continua em config_operacional; linhas por tenant passam a ser upsertadas pelo app.

-- 6) Bootstrap config_operacional por tenant existente
INSERT INTO public.config_operacional (
  id,
  tenant_id,
  valor_padrao_entrega,
  pedido_minimo,
  loja_aberta,
  pontos_por_real,
  horario_automatico,
  pausa_imediata,
  fuso_horario,
  updated_at
)
SELECT
  t.id::text,
  t.id,
  COALESCE(ts.delivery_fee_default, 5),
  COALESCE(ts.pedido_minimo, 0),
  COALESCE(ts.loja_aberta, true),
  COALESCE(ts.pontos_por_real, 1),
  true,
  false,
  COALESCE(t.timezone, 'America/Recife'),
  now()
FROM public.tenants t
LEFT JOIN public.tenant_settings ts ON ts.tenant_id = t.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.config_operacional co WHERE co.tenant_id = t.id
)
ON CONFLICT (id) DO NOTHING;
