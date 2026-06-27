-- Tenant staff pode gerenciar entregas do próprio restaurante (multitenant)
DROP POLICY IF EXISTS "tenant staff gerencia entregas" ON public.entregas;
CREATE POLICY "tenant staff gerencia entregas"
ON public.entregas
FOR ALL
TO authenticated
USING (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id));

-- Entregador atualiza entregas atribuídas a ele
DROP POLICY IF EXISTS "motoboy atualiza suas entregas" ON public.entregas;
CREATE POLICY "motoboy atualiza suas entregas"
ON public.entregas
FOR UPDATE
TO authenticated
USING (
  motoboy_id = auth.uid()
  OR (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
)
WITH CHECK (
  motoboy_id = auth.uid()
  OR (tenant_id IS NOT NULL AND public.is_tenant_manager(tenant_id))
);

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
          AND EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.user_id = _user_id
              AND tu.tenant_id = e.tenant_id
              AND tu.status = 'active'
              AND tu.role IN ('owner','admin','gerente','entregador')
          )
          AND (
            e.motoboy_id = _user_id
            OR (e.motoboy_id IS NULL AND e.status = 'pendente' AND public.has_role(_user_id, 'motoboy'))
            OR EXISTS (
              SELECT 1 FROM public.tenant_users tu2
              WHERE tu2.user_id = _user_id AND tu2.tenant_id = e.tenant_id
                AND tu2.role IN ('owner','admin','gerente') AND tu2.status = 'active'
            )
          )
        )
        OR (
          e.motoboy_id IS NULL
          AND e.status = 'pendente'
          AND public.has_role(_user_id, 'motoboy')
        )
        OR p.cliente_id = _user_id
      )
  );
$$;
