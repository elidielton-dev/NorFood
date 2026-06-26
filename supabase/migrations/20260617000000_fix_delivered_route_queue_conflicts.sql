CREATE OR REPLACE FUNCTION public.shift_delivery_queue_after_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _historical_order INTEGER;
BEGIN
  IF NEW.status = 'entregue' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.entregador_id IS NOT NULL THEN
    SELECT gs.ordem
    INTO _historical_order
    FROM generate_series(1001, 20000) AS gs(ordem)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.rotas_entrega re
      WHERE re.entregador_id = NEW.entregador_id
        AND re.status = 'entregue'
        AND re.pedido_id <> NEW.id
        AND re.ordem_entrega = gs.ordem
    )
    ORDER BY gs.ordem
    LIMIT 1;

    UPDATE public.rotas_entrega
    SET
      status = 'entregue',
      ordem_entrega = COALESCE(_historical_order, 1001)
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
