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
