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
        OR (e.motoboy_id IS NULL AND e.status = 'pendente' AND public.has_role(_user_id, 'motoboy'))
        OR p.cliente_id = _user_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_pedido(_pedido_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pedidos p
    LEFT JOIN public.entregas e ON e.pedido_id = p.id
    WHERE p.id = _pedido_id
      AND (
        p.cliente_id = _user_id
        OR public.is_staff(_user_id)
        OR p.entregador_id = _user_id
        OR e.motoboy_id = _user_id
        OR (e.motoboy_id IS NULL AND e.status = 'pendente' AND public.has_role(_user_id, 'motoboy'))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_delivery_customer_profile(_profile_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pedidos p
    JOIN public.entregas e ON e.pedido_id = p.id
    WHERE p.cliente_id = _profile_id
      AND (
        public.is_staff(_user_id)
        OR e.motoboy_id = _user_id
        OR (e.motoboy_id IS NULL AND e.status = 'pendente' AND public.has_role(_user_id, 'motoboy'))
      )
  );
$$;

DROP POLICY IF EXISTS "cliente vê seus pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "cliente vÃª seus pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "cliente vÃƒÂª seus pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "cliente ve pedidos e motoboy ve fila" ON public.pedidos;
CREATE POLICY "cliente ve pedidos e motoboy ve fila"
ON public.pedidos
FOR SELECT TO authenticated
USING (public.can_view_pedido(id, auth.uid()));

DROP POLICY IF EXISTS "entregas: cliente/staff/motoboy" ON public.entregas;
DROP POLICY IF EXISTS "entregas cliente staff e motoboy" ON public.entregas;
CREATE POLICY "entregas cliente staff e motoboy"
ON public.entregas
FOR SELECT TO authenticated
USING (public.can_view_entrega(id, auth.uid()));

DROP POLICY IF EXISTS "motoboy ve clientes das proprias entregas" ON public.profiles;
CREATE POLICY "motoboy ve clientes das proprias entregas"
ON public.profiles
FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR public.is_staff(auth.uid())
  OR public.can_view_delivery_customer_profile(id, auth.uid())
);
