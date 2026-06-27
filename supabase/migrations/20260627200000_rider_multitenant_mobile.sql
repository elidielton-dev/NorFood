-- Entregador mobile: isolamento multitenant + avatars + RPCs

CREATE OR REPLACE FUNCTION public.is_tenant_entregador(_tenant_id UUID, _user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.user_id = _user_id
      AND tu.tenant_id = _tenant_id
      AND tu.status = 'active'
      AND tu.role IN ('entregador', 'owner', 'admin', 'gerente')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_rider_act_on_entrega(_entrega_id UUID, _user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.entregas e
    WHERE e.id = _entrega_id
      AND (
        public.is_staff(_user_id)
        OR (
          e.tenant_id IS NOT NULL
          AND public.is_tenant_entregador(e.tenant_id, _user_id)
          AND (
            e.motoboy_id = _user_id
            OR (e.motoboy_id IS NULL AND e.status = 'pendente')
          )
        )
        OR (
          e.motoboy_id = _user_id
          AND public.has_role(_user_id, 'motoboy')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_entrega(_entrega_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.entregas e
    LEFT JOIN public.pedidos p ON p.id = e.pedido_id
    WHERE e.id = _entrega_id
      AND (
        public.is_staff(_user_id)
        OR e.motoboy_id = _user_id
        OR (
          e.tenant_id IS NOT NULL
          AND public.is_tenant_entregador(e.tenant_id, _user_id)
          AND (
            e.motoboy_id = _user_id
            OR (e.motoboy_id IS NULL AND e.status = 'pendente')
            OR EXISTS (
              SELECT 1 FROM public.tenant_users tu2
              WHERE tu2.user_id = _user_id
                AND tu2.tenant_id = e.tenant_id
                AND tu2.role IN ('owner', 'admin', 'gerente')
                AND tu2.status = 'active'
            )
          )
        )
        OR (
          e.motoboy_id IS NULL
          AND e.status = 'pendente'
          AND public.has_role(_user_id, 'motoboy')
          AND (
            e.tenant_id IS NULL
            OR public.is_tenant_entregador(e.tenant_id, _user_id)
          )
        )
        OR p.cliente_id = _user_id
      )
  );
$$;

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

  IF NOT public.can_rider_act_on_entrega(_entrega_id, auth.uid()) THEN
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

GRANT EXECUTE ON FUNCTION public.is_tenant_entregador(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_rider_act_on_entrega(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.motoboy_accept_entrega(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.motoboy_avancar_entrega(UUID, TEXT) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars owner upload" ON storage.objects;
CREATE POLICY "avatars owner upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
CREATE POLICY "avatars owner update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "avatars owner delete" ON storage.objects;
CREATE POLICY "avatars owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
