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

DROP POLICY IF EXISTS "motoboy ve clientes das proprias entregas" ON public.profiles;
CREATE POLICY "motoboy ve clientes das proprias entregas"
ON public.profiles
FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR public.is_staff(auth.uid())
  OR public.can_view_delivery_customer_profile(id, auth.uid())
);
