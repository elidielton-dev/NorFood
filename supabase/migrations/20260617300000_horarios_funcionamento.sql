-- Grade semanal de funcionamento + config operacional (idempotente / standalone)

CREATE TABLE IF NOT EXISTS public.config_operacional (
  id TEXT PRIMARY KEY DEFAULT 'default',
  valor_padrao_entrega NUMERIC(10, 2) NOT NULL DEFAULT 5,
  pedido_minimo NUMERIC(10, 2) NOT NULL DEFAULT 0,
  loja_aberta BOOLEAN NOT NULL DEFAULT true,
  pontos_por_real NUMERIC(5, 2) NOT NULL DEFAULT 1,
  horario_automatico BOOLEAN NOT NULL DEFAULT true,
  pausa_imediata BOOLEAN NOT NULL DEFAULT false,
  fuso_horario TEXT NOT NULL DEFAULT 'America/Recife',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.config_operacional
  ADD COLUMN IF NOT EXISTS horario_automatico BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pausa_imediata BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fuso_horario TEXT NOT NULL DEFAULT 'America/Recife';

INSERT INTO public.config_operacional (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.config_operacional TO anon, authenticated;
GRANT ALL ON public.config_operacional TO service_role;
ALTER TABLE public.config_operacional ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config operacional leitura publica" ON public.config_operacional;
CREATE POLICY "config operacional leitura publica"
  ON public.config_operacional FOR SELECT USING (true);

DROP POLICY IF EXISTS "staff gerencia config operacional" ON public.config_operacional;
CREATE POLICY "staff gerencia config operacional"
  ON public.config_operacional FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.horarios_funcionamento (
  dia_semana SMALLINT PRIMARY KEY CHECK (dia_semana BETWEEN 0 AND 6),
  ativo BOOLEAN NOT NULL DEFAULT true,
  abre TIME NOT NULL DEFAULT '08:00',
  fecha TIME NOT NULL DEFAULT '20:00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.horarios_funcionamento.dia_semana IS '0=domingo ... 6=sabado';

INSERT INTO public.horarios_funcionamento (dia_semana, ativo, abre, fecha) VALUES
  (0, true, '08:00', '14:00'),
  (1, true, '08:00', '20:00'),
  (2, true, '08:00', '20:00'),
  (3, true, '08:00', '20:00'),
  (4, true, '08:00', '20:00'),
  (5, true, '08:00', '20:00'),
  (6, true, '08:00', '18:00')
ON CONFLICT (dia_semana) DO NOTHING;

GRANT SELECT ON public.horarios_funcionamento TO anon, authenticated;
GRANT ALL ON public.horarios_funcionamento TO service_role;
ALTER TABLE public.horarios_funcionamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "horarios leitura publica" ON public.horarios_funcionamento;
CREATE POLICY "horarios leitura publica"
  ON public.horarios_funcionamento FOR SELECT USING (true);

DROP POLICY IF EXISTS "staff gerencia horarios" ON public.horarios_funcionamento;
CREATE POLICY "staff gerencia horarios"
  ON public.horarios_funcionamento FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

UPDATE public.config_operacional
SET fuso_horario = 'America/Recife'
WHERE id = 'default';
