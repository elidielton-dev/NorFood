-- Corrige cast de pedido_status na RPC motoboy_avancar_entrega (multitenant).
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
  _mapped_status TEXT;
  _mapped_rota TEXT;
  _mapped_pedido public.pedido_status;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT e.*
  INTO _entrega
  FROM public.entregas e
  WHERE e.id = _entrega_id
    AND (
      public.is_staff(auth.uid())
      OR e.motoboy_id = auth.uid()
      OR (
        e.tenant_id IS NOT NULL
        AND public.is_tenant_entregador(e.tenant_id, auth.uid())
        AND e.motoboy_id = auth.uid()
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_not_found_or_unavailable';
  END IF;

  _mapped_status := CASE _stage
    WHEN 'assigned' THEN 'aceito'
    WHEN 'arrived_store' THEN 'na_loja'
    WHEN 'picked_up' THEN 'pedido_retirado'
    WHEN 'arrived_customer' THEN 'chegou_cliente'
    WHEN 'delivered' THEN 'entregue'
    ELSE NULL
  END;

  IF _mapped_status IS NULL THEN
    RAISE EXCEPTION 'invalid_stage';
  END IF;

  _mapped_rota := CASE _stage
    WHEN 'assigned' THEN 'pendente'
    WHEN 'arrived_store' THEN 'na_loja'
    WHEN 'picked_up' THEN 'em_rota'
    WHEN 'arrived_customer' THEN 'chegando'
    WHEN 'delivered' THEN 'entregue'
    ELSE 'pendente'
  END;

  _mapped_pedido := CASE _stage
    WHEN 'picked_up' THEN 'em_entrega'::public.pedido_status
    WHEN 'arrived_customer' THEN 'em_entrega'::public.pedido_status
    WHEN 'delivered' THEN 'entregue'::public.pedido_status
    ELSE NULL
  END;

  UPDATE public.entregas
  SET
    status = _mapped_status,
    updated_at = now(),
    saiu_em = COALESCE(_entrega.saiu_em, now()),
    entregue_em = CASE WHEN _stage = 'delivered' THEN now() ELSE _entrega.entregue_em END
  WHERE id = _entrega_id
  RETURNING pedido_id INTO _pedido_id;

  UPDATE public.rotas_entrega
  SET status = _mapped_rota
  WHERE pedido_id = _pedido_id;

  IF _mapped_pedido IS NOT NULL THEN
    UPDATE public.pedidos
    SET status = _mapped_pedido, updated_at = now()
    WHERE id = _pedido_id;
  END IF;

  RETURN (
    SELECT e
    FROM public.entregas e
    WHERE e.id = _entrega_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.motoboy_avancar_entrega(UUID, TEXT) TO authenticated;
