-- Staff multitenant (tenant_users) deve ver pedidos e financeiro do próprio restaurante.
-- Antes só is_staff(user_roles legado) liberava SELECT — donos SaaS novos ficavam sem ver vendas no painel.

CREATE OR REPLACE FUNCTION public.is_tenant_staff_for_user(_tenant_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = _tenant_id
      AND tu.user_id = _user_id
      AND tu.status = 'active'
      AND tu.role IN (
        'owner', 'admin', 'gerente', 'atendente', 'cozinha', 'entregador', 'financeiro'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_tenant_staff_for_user(UUID, UUID) TO authenticated;

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
        OR (
          p.tenant_id IS NOT NULL
          AND public.is_tenant_staff_for_user(p.tenant_id, _user_id)
        )
        OR p.entregador_id = _user_id
        OR e.motoboy_id = _user_id
        OR (e.motoboy_id IS NULL AND e.status = 'pendente' AND public.has_role(_user_id, 'motoboy'))
      )
  );
$$;

DROP POLICY IF EXISTS "staff atualiza pedidos" ON public.pedidos;
CREATE POLICY "staff atualiza pedidos"
ON public.pedidos
FOR UPDATE
TO authenticated
USING (
  public.is_staff(auth.uid())
  OR (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
)
WITH CHECK (
  public.is_staff(auth.uid())
  OR (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
);

DROP POLICY IF EXISTS "staff vê financeiro" ON public.lancamentos_financeiros;
DROP POLICY IF EXISTS "staff ve financeiro" ON public.lancamentos_financeiros;
CREATE POLICY "staff ve financeiro tenant"
ON public.lancamentos_financeiros
FOR ALL
TO authenticated
USING (
  public.is_staff(auth.uid())
  OR (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
)
WITH CHECK (
  public.is_staff(auth.uid())
  OR (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
);

DROP POLICY IF EXISTS "itens conforme pedido" ON public.pedido_itens;
CREATE POLICY "itens conforme pedido"
ON public.pedido_itens
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pedidos p
    WHERE p.id = pedido_id
      AND public.can_view_pedido(p.id, auth.uid())
  )
);

DROP POLICY IF EXISTS "staff/cliente insere itens" ON public.pedido_itens;
CREATE POLICY "staff cliente insere itens"
ON public.pedido_itens
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.pedidos p
    WHERE p.id = pedido_id
      AND (
        p.cliente_id = auth.uid()
        OR public.is_staff(auth.uid())
        OR (p.tenant_id IS NOT NULL AND public.is_tenant_staff(p.tenant_id))
      )
  )
);

DROP POLICY IF EXISTS "staff atualiza itens" ON public.pedido_itens;
CREATE POLICY "staff atualiza itens"
ON public.pedido_itens
FOR UPDATE
TO authenticated
USING (
  public.is_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND p.tenant_id IS NOT NULL
      AND public.is_tenant_staff(p.tenant_id)
  )
)
WITH CHECK (
  public.is_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND p.tenant_id IS NOT NULL
      AND public.is_tenant_staff(p.tenant_id)
  )
);

DROP POLICY IF EXISTS "staff deleta itens" ON public.pedido_itens;
CREATE POLICY "staff deleta itens"
ON public.pedido_itens
FOR DELETE
TO authenticated
USING (
  public.is_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND p.tenant_id IS NOT NULL
      AND public.is_tenant_staff(p.tenant_id)
  )
);
