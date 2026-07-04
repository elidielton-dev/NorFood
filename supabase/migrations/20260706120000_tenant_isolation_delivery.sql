-- Isolamento multi-tenant estrito: pedidos, entregas, itens, financeiro, rotas.
-- Remove is_staff global (legado) dessas policies; staff só via tenant_users.
-- Platform admin continua via service_role / supabaseAdmin no app.

-- Helpers (podem não existir se migrations anteriores não rodaram em produção)
CREATE OR REPLACE FUNCTION public.is_tenant_staff(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE tenant_id = _tenant_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner','admin','gerente','atendente','cozinha','entregador','financeiro')
  );
$$;

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

GRANT EXECUTE ON FUNCTION public.is_tenant_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_staff_for_user(UUID, UUID) TO authenticated;

-- Backfill one-shot: pedidos delivery órfãos a partir dos produtos
UPDATE public.pedidos p
SET tenant_id = prod.tenant_id
FROM (
  SELECT DISTINCT ON (pi.pedido_id) pi.pedido_id, pr.tenant_id
  FROM public.pedido_itens pi
  INNER JOIN public.produtos pr ON pr.id = pi.produto_id
  WHERE pr.tenant_id IS NOT NULL
  ORDER BY pi.pedido_id, pr.tenant_id
) prod
WHERE p.id = prod.pedido_id
  AND p.tenant_id IS NULL
  AND p.canal = 'delivery';

UPDATE public.entregas e
SET tenant_id = p.tenant_id
FROM public.pedidos p
WHERE e.pedido_id = p.id
  AND e.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

UPDATE public.rotas_entrega r
SET tenant_id = p.tenant_id
FROM public.pedidos p
WHERE r.pedido_id = p.id
  AND r.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

UPDATE public.lancamentos_financeiros lf
SET tenant_id = p.tenant_id
FROM public.pedidos p
WHERE lf.pedido_id = p.id
  AND lf.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

-- can_view_pedido: sem is_staff global
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
        OR (
          p.tenant_id IS NOT NULL
          AND public.is_tenant_staff_for_user(p.tenant_id, _user_id)
        )
        OR p.entregador_id = _user_id
        OR e.motoboy_id = _user_id
        OR (
          e.motoboy_id IS NULL
          AND e.status = 'pendente'
          AND e.tenant_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.user_id = _user_id
              AND tu.tenant_id = e.tenant_id
              AND tu.status = 'active'
              AND tu.role = 'entregador'
          )
        )
      )
  );
$$;

-- can_view_entrega: sem is_staff global
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
        e.motoboy_id = _user_id
        OR p.cliente_id = _user_id
        OR (
          e.tenant_id IS NOT NULL
          AND public.is_tenant_staff_for_user(e.tenant_id, _user_id)
        )
        OR (
          e.motoboy_id IS NULL
          AND e.status = 'pendente'
          AND e.tenant_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.user_id = _user_id
              AND tu.tenant_id = e.tenant_id
              AND tu.status = 'active'
              AND tu.role = 'entregador'
          )
        )
      )
  );
$$;

-- Pedidos UPDATE (staff do tenant ou entregador atribuído)
DROP POLICY IF EXISTS "staff atualiza pedidos" ON public.pedidos;
CREATE POLICY "staff atualiza pedidos"
ON public.pedidos
FOR UPDATE
TO authenticated
USING (
  entregador_id = auth.uid()
  OR (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
)
WITH CHECK (
  entregador_id = auth.uid()
  OR (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
);

-- Pedidos INSERT: cliente próprio ou staff do tenant
DROP POLICY IF EXISTS "cliente cria pedido próprio" ON public.pedidos;
DROP POLICY IF EXISTS "cliente cria pedido proprio" ON public.pedidos;
CREATE POLICY "cliente ou tenant staff cria pedido"
ON public.pedidos
FOR INSERT
TO authenticated
WITH CHECK (
  cliente_id = auth.uid()
  OR (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
);

-- Financeiro
DROP POLICY IF EXISTS "staff ve financeiro tenant" ON public.lancamentos_financeiros;
DROP POLICY IF EXISTS "staff vê financeiro" ON public.lancamentos_financeiros;
DROP POLICY IF EXISTS "staff ve financeiro" ON public.lancamentos_financeiros;
CREATE POLICY "tenant staff financeiro"
ON public.lancamentos_financeiros
FOR ALL
TO authenticated
USING (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id));

-- Pedido itens
DROP POLICY IF EXISTS "staff cliente insere itens" ON public.pedido_itens;
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
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND p.tenant_id IS NOT NULL
      AND public.is_tenant_staff(p.tenant_id)
  )
)
WITH CHECK (
  EXISTS (
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
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND p.tenant_id IS NOT NULL
      AND public.is_tenant_staff(p.tenant_id)
  )
);

-- Entregas: drop legacy staff-all if exists
DROP POLICY IF EXISTS "staff gerencia entregas" ON public.entregas;
DROP POLICY IF EXISTS "tenant staff gerencia entregas" ON public.entregas;
CREATE POLICY "tenant staff gerencia entregas"
ON public.entregas
FOR ALL
TO authenticated
USING (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id));

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
  OR (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
);

-- Rotas entrega
DROP POLICY IF EXISTS "staff gerencia rotas" ON public.rotas_entrega;
DROP POLICY IF EXISTS "rotas: cliente staff e motoboy" ON public.rotas_entrega;
DROP POLICY IF EXISTS "rotas cliente staff e motoboy" ON public.rotas_entrega;

CREATE POLICY "rotas select tenant"
ON public.rotas_entrega
FOR SELECT
TO authenticated
USING (
  entregador_id = auth.uid()
  OR (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
  OR EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id AND p.cliente_id = auth.uid()
  )
);

CREATE POLICY "rotas write tenant staff"
ON public.rotas_entrega
FOR ALL
TO authenticated
USING (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id));

-- cliente_enderecos (omnichannel): sem is_staff global
DROP POLICY IF EXISTS "cliente enderecos staff" ON public.cliente_enderecos;
CREATE POLICY "cliente enderecos staff"
  ON public.cliente_enderecos FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_staff(tenant_id));
