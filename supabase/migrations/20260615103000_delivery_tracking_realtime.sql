ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS entregador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ordem_na_rota INTEGER,
  ADD COLUMN IF NOT EXISTS previsao_entrega TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS distancia_restante NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS latitude_cliente DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude_cliente DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS public.entregadores_localizacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  battery INTEGER,
  status TEXT NOT NULL DEFAULT 'online',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS entregadores_localizacao_entregador_idx
  ON public.entregadores_localizacao (entregador_id);

CREATE TABLE IF NOT EXISTS public.rotas_entrega (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  ordem_entrega INTEGER NOT NULL DEFAULT 1,
  distancia_km NUMERIC(8,2),
  tempo_estimado INTEGER,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pedido_id),
  UNIQUE (entregador_id, ordem_entrega)
);

GRANT SELECT, INSERT, UPDATE ON public.entregadores_localizacao TO authenticated;
GRANT ALL ON public.entregadores_localizacao TO service_role;
ALTER TABLE public.entregadores_localizacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "localizacao: cliente staff e motoboy"
ON public.entregadores_localizacao
FOR SELECT TO authenticated
USING (
  public.is_staff(auth.uid())
  OR entregador_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.pedidos p
    WHERE p.entregador_id = entregador_id
      AND p.cliente_id = auth.uid()
      AND p.status IN ('pronto', 'em_entrega')
  )
);

CREATE POLICY "motoboy atualiza propria localizacao"
ON public.entregadores_localizacao
FOR ALL TO authenticated
USING (entregador_id = auth.uid() OR public.is_staff(auth.uid()))
WITH CHECK (entregador_id = auth.uid() OR public.is_staff(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotas_entrega TO authenticated;
GRANT ALL ON public.rotas_entrega TO service_role;
ALTER TABLE public.rotas_entrega ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rotas: cliente staff e motoboy"
ON public.rotas_entrega
FOR SELECT TO authenticated
USING (
  public.is_staff(auth.uid())
  OR entregador_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.pedidos p
    WHERE p.id = pedido_id
      AND p.cliente_id = auth.uid()
  )
);

CREATE POLICY "staff gerencia rotas"
ON public.rotas_entrega
FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.sync_pedido_rota_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.pedidos
  SET
    entregador_id = NEW.entregador_id,
    ordem_na_rota = NEW.ordem_entrega,
    updated_at = now()
  WHERE id = NEW.pedido_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.shift_delivery_queue_after_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'entregue' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.entregador_id IS NOT NULL THEN
    UPDATE public.rotas_entrega
    SET
      status = 'entregue',
      ordem_entrega = 1000 + (
        SELECT COUNT(*)
        FROM public.rotas_entrega re
        WHERE re.entregador_id = NEW.entregador_id
          AND re.status = 'entregue'
          AND re.pedido_id <> NEW.id
      ) + 1
    WHERE pedido_id = NEW.id;

    UPDATE public.rotas_entrega
    SET ordem_entrega = GREATEST(ordem_entrega - 1, 1)
    WHERE entregador_id = NEW.entregador_id
      AND pedido_id <> NEW.id
      AND ordem_entrega > COALESCE(OLD.ordem_na_rota, NEW.ordem_na_rota, 0)
      AND status <> 'entregue';

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rotas_sync_pedidos ON public.rotas_entrega;
CREATE TRIGGER trg_rotas_sync_pedidos
  AFTER INSERT OR UPDATE ON public.rotas_entrega
  FOR EACH ROW EXECUTE FUNCTION public.sync_pedido_rota_fields();

DROP TRIGGER IF EXISTS trg_pedidos_shift_queue ON public.pedidos;
CREATE TRIGGER trg_pedidos_shift_queue
  AFTER UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.shift_delivery_queue_after_completion();

ALTER PUBLICATION supabase_realtime ADD TABLE public.entregadores_localizacao;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rotas_entrega;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
