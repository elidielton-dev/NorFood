CREATE POLICY "motoboy ve pedidos atribuidos"
ON public.pedidos
FOR SELECT TO authenticated
USING (entregador_id = auth.uid());

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

  SELECT COALESCE(MAX(ordem_entrega), 0) + 1
  INTO _next_order
  FROM public.rotas_entrega
  WHERE entregador_id = auth.uid()
    AND status <> 'entregue'
    AND ordem_entrega < 1000;

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
    _next_order,
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

CREATE OR REPLACE FUNCTION public.motoboy_avancar_entrega(
  _entrega_id UUID,
  _stage TEXT
)
RETURNS public.entregas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _entrega public.entregas%ROWTYPE;
  _pedido_id UUID;
  _entrega_status TEXT;
  _rota_status TEXT;
  _pedido_status public.pedido_status;
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
      OR e.motoboy_id = auth.uid()
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_not_found_or_forbidden';
  END IF;

  _pedido_id := _entrega.pedido_id;

  CASE _stage
    WHEN 'assigned' THEN
      _entrega_status := 'aceito';
      _rota_status := 'pendente';
      _pedido_status := NULL;
    WHEN 'arrived_store' THEN
      _entrega_status := 'na_loja';
      _rota_status := 'na_loja';
      _pedido_status := NULL;
    WHEN 'picked_up' THEN
      _entrega_status := 'pedido_retirado';
      _rota_status := 'em_rota';
      _pedido_status := 'em_entrega';
    WHEN 'arrived_customer' THEN
      _entrega_status := 'chegou_cliente';
      _rota_status := 'chegando';
      _pedido_status := 'em_entrega';
    WHEN 'delivered' THEN
      _entrega_status := 'entregue';
      _rota_status := 'entregue';
      _pedido_status := 'entregue';
    ELSE
      RAISE EXCEPTION 'invalid_stage';
  END CASE;

  UPDATE public.entregas
  SET
    status = _entrega_status,
    saiu_em = CASE
      WHEN _stage IN ('assigned', 'arrived_store', 'picked_up', 'arrived_customer', 'delivered')
        THEN COALESCE(_entrega.saiu_em, now())
      ELSE _entrega.saiu_em
    END,
    entregue_em = CASE
      WHEN _stage = 'delivered' THEN now()
      ELSE _entrega.entregue_em
    END,
    updated_at = now()
  WHERE id = _entrega_id;

  UPDATE public.rotas_entrega
  SET
    status = _rota_status
  WHERE pedido_id = _pedido_id
    AND entregador_id = COALESCE(_entrega.motoboy_id, auth.uid());

  IF _pedido_status IS NOT NULL THEN
    UPDATE public.pedidos
    SET
      status = _pedido_status,
      updated_at = now()
    WHERE id = _pedido_id;
  END IF;

  RETURN (
    SELECT e
    FROM public.entregas e
    WHERE e.id = _entrega_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.motoboy_accept_entrega(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.motoboy_avancar_entrega(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.motoboy_accept_entrega(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.motoboy_avancar_entrega(UUID, TEXT) TO authenticated;
