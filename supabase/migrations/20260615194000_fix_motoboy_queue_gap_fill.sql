CREATE OR REPLACE FUNCTION public.motoboy_accept_entrega(_entrega_id UUID)
RETURNS public.entregas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _entrega public.entregas%ROWTYPE;
  _pedido_id UUID;
  _distancia_km NUMERIC(8,2);
  _next_order INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT (public.has_role(auth.uid(), 'motoboy') OR public.is_staff(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT e.*
  INTO _entrega
  FROM public.entregas e
  WHERE e.id = _entrega_id
    AND (
      public.is_staff(auth.uid())
      OR e.motoboy_id IS NULL
      OR e.motoboy_id = auth.uid()
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_not_found_or_unavailable';
  END IF;

  UPDATE public.entregas
  SET
    motoboy_id = COALESCE(_entrega.motoboy_id, auth.uid()),
    status = 'aceito',
    saiu_em = COALESCE(_entrega.saiu_em, now()),
    updated_at = now()
  WHERE id = _entrega_id
  RETURNING pedido_id, distancia_km
  INTO _pedido_id, _distancia_km;

  SELECT gs.ordem
  INTO _next_order
  FROM generate_series(1, 1000) AS gs(ordem)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.rotas_entrega re
    WHERE re.entregador_id = auth.uid()
      AND re.status <> 'entregue'
      AND re.ordem_entrega < 1000
      AND re.ordem_entrega = gs.ordem
  )
  ORDER BY gs.ordem
  LIMIT 1;

  INSERT INTO public.rotas_entrega (
    entregador_id,
    pedido_id,
    ordem_entrega,
    distancia_km,
    status
  )
  VALUES (
    auth.uid(),
    _pedido_id,
    COALESCE(_next_order, 1),
    _distancia_km,
    'pendente'
  )
  ON CONFLICT (pedido_id) DO UPDATE
  SET
    entregador_id = EXCLUDED.entregador_id,
    ordem_entrega = CASE
      WHEN public.rotas_entrega.status = 'entregue' THEN public.rotas_entrega.ordem_entrega
      ELSE EXCLUDED.ordem_entrega
    END,
    distancia_km = COALESCE(public.rotas_entrega.distancia_km, EXCLUDED.distancia_km),
    status = CASE
      WHEN public.rotas_entrega.status = 'entregue' THEN public.rotas_entrega.status
      ELSE 'pendente'
    END;

  RETURN (
    SELECT e
    FROM public.entregas e
    WHERE e.id = _entrega_id
  );
END;
$$;
