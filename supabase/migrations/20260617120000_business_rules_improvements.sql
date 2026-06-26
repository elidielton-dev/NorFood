-- RBAC: permite checagem de papéis via RPC autenticada
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;

-- Configuração operacional centralizada
CREATE TABLE IF NOT EXISTS public.config_operacional (
  id TEXT PRIMARY KEY DEFAULT 'default',
  valor_padrao_entrega NUMERIC(10,2) NOT NULL DEFAULT 5,
  pedido_minimo NUMERIC(10,2) NOT NULL DEFAULT 0,
  loja_aberta BOOLEAN NOT NULL DEFAULT true,
  pontos_por_real NUMERIC(5,2) NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.config_operacional (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.config_operacional TO anon, authenticated;
GRANT ALL ON public.config_operacional TO service_role;
ALTER TABLE public.config_operacional ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config operacional leitura publica"
  ON public.config_operacional FOR SELECT USING (true);
CREATE POLICY "staff gerencia config operacional"
  ON public.config_operacional FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Bairros de entrega (fonte única de taxa)
CREATE TABLE IF NOT EXISTS public.bairros_entrega (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  taxa NUMERIC(10,2) NOT NULL DEFAULT 5,
  latitude NUMERIC(10,6),
  longitude NUMERIC(10,6),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bairros_entrega TO anon, authenticated;
GRANT ALL ON public.bairros_entrega TO service_role;
ALTER TABLE public.bairros_entrega ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bairros entrega leitura publica"
  ON public.bairros_entrega FOR SELECT USING (ativo OR public.is_staff(auth.uid()));
CREATE POLICY "staff gerencia bairros entrega"
  ON public.bairros_entrega FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.bairros_entrega (nome, taxa, latitude, longitude) VALUES
  ('Centro', 5, -8.0874, -37.6392),
  ('Redencao', 5, -8.0826, -37.6338),
  ('Pindoba', 5, -8.0788, -37.6284),
  ('Rodoviaria', 5, -8.0908, -37.6456),
  ('Cohab', 5, -8.0932, -37.6498),
  ('Novo Horizonte', 5, -8.0964, -37.6537),
  ('Mandacaru', 5, -8.0836, -37.6507),
  ('Baixa Grande', 5, -8.1012, -37.6591),
  ('Sao Jose', 5, -8.0911, -37.6362),
  ('Santa Luzia', 5, -8.0882, -37.6314),
  ('Perpetuo Socorro', 5, -8.0796, -37.6411),
  ('Vila Pomar', 5, -8.0738, -37.6485)
ON CONFLICT (nome) DO NOTHING;

-- Notas fiscais
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'NFC-e',
  status TEXT NOT NULL DEFAULT 'pendente',
  chave_acesso TEXT,
  numero TEXT,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  xml_url TEXT,
  danfe_url TEXT,
  xml_enviado_contabilidade BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.notas_fiscais TO authenticated;
GRANT ALL ON public.notas_fiscais TO service_role;
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff gerencia notas fiscais"
  ON public.notas_fiscais FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Baixa de estoque ao inserir item de pedido
CREATE OR REPLACE FUNCTION public.decrementar_estoque_item_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.produtos
  SET
    estoque = GREATEST(0, COALESCE(estoque, 0) - NEW.quantidade),
    updated_at = now()
  WHERE id = NEW.produto_id
    AND estoque IS NOT NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedido_itens_decrementa_estoque ON public.pedido_itens;
CREATE TRIGGER trg_pedido_itens_decrementa_estoque
  AFTER INSERT ON public.pedido_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.decrementar_estoque_item_pedido();

-- Fidelidade ao concluir pedido
CREATE OR REPLACE FUNCTION public.creditar_fidelidade_ao_entregar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pontos_por_real NUMERIC(5,2);
  _pontos INTEGER;
BEGIN
  IF NEW.status <> 'entregue' OR OLD.status = 'entregue' THEN
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pontos_por_real INTO _pontos_por_real
  FROM public.config_operacional
  WHERE id = 'default';

  _pontos := GREATEST(0, FLOOR(COALESCE(NEW.total, 0) * COALESCE(_pontos_por_real, 1)));

  IF _pontos > 0 THEN
    UPDATE public.profiles
    SET
      pontos_fidelidade = pontos_fidelidade + _pontos,
      updated_at = now()
    WHERE id = NEW.cliente_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_fidelidade ON public.pedidos;
CREATE TRIGGER trg_pedidos_fidelidade
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.creditar_fidelidade_ao_entregar();

-- Estorno financeiro ao cancelar
CREATE OR REPLACE FUNCTION public.estornar_financeiro_ao_cancelar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'cancelado' OR OLD.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.lancamentos_financeiros (tipo, descricao, categoria, valor, forma, pedido_id, data)
  SELECT
    'saida',
    'Estorno pedido #' || NEW.numero,
    'Estorno',
    lf.valor,
    lf.forma,
    NEW.id,
    CURRENT_DATE
  FROM public.lancamentos_financeiros lf
  WHERE lf.pedido_id = NEW.id
    AND lf.tipo = 'entrada'
    AND NOT EXISTS (
      SELECT 1
      FROM public.lancamentos_financeiros est
      WHERE est.pedido_id = NEW.id
        AND est.tipo = 'saida'
        AND est.descricao LIKE 'Estorno pedido #%'
    )
  LIMIT 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_estorno_financeiro ON public.pedidos;
CREATE TRIGGER trg_pedidos_estorno_financeiro
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.estornar_financeiro_ao_cancelar();

-- Lançamento financeiro ao entregar (para pedidos sem entrada prévia)
CREATE OR REPLACE FUNCTION public.lancar_financeiro_ao_entregar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'entregue' OR OLD.status = 'entregue' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lancamentos_financeiros
    WHERE pedido_id = NEW.id AND tipo = 'entrada'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.lancamentos_financeiros (tipo, descricao, categoria, valor, forma, pedido_id, data)
  VALUES (
    'entrada',
    'Pedido #' || NEW.numero,
    'Vendas ' || NEW.canal::text,
    NEW.total,
    NEW.forma_pagamento,
    NEW.id,
    CURRENT_DATE
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_financeiro_entrega ON public.pedidos;
CREATE TRIGGER trg_pedidos_financeiro_entrega
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.lancar_financeiro_ao_entregar();
