-- Módulo avançado de produtos: colunas estendidas e tabelas relacionadas

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS status_categoria TEXT NOT NULL DEFAULT 'ativo';

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS subcategoria TEXT,
  ADD COLUMN IF NOT EXISTS preco_promocional NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS custo_producao NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidade TEXT NOT NULL DEFAULT 'unidade',
  ADD COLUMN IF NOT EXISTS descricao_curta TEXT,
  ADD COLUMN IF NOT EXISTS ingredientes TEXT,
  ADD COLUMN IF NOT EXISTS alergenos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS peso_aproximado TEXT,
  ADD COLUMN IF NOT EXISTS serve_pessoas TEXT,
  ADD COLUMN IF NOT EXISTS validade TEXT,
  ADD COLUMN IF NOT EXISTS recomendado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS novo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mais_vendido BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_produto TEXT NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS disponivel_canais JSONB NOT NULL DEFAULT '["balcao","mesas","delivery","qrcode"]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_pause_sem_estoque BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vendas_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receita_total NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.produto_variacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  estoque INTEGER NOT NULL DEFAULT 0,
  tempo_preparo INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.produto_ficha_tecnica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  ingrediente TEXT NOT NULL,
  quantidade NUMERIC(10,3) NOT NULL DEFAULT 1,
  unidade TEXT NOT NULL DEFAULT 'un',
  custo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  fornecedor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.grupos_adicionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.produto_adicionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID NOT NULL REFERENCES public.grupos_adicionais(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  estoque INTEGER NOT NULL DEFAULT 0,
  obrigatorio BOOLEAN NOT NULL DEFAULT false,
  minimo INTEGER NOT NULL DEFAULT 0,
  maximo INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.produto_promocoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'percentual',
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  titulo TEXT NOT NULL,
  inicio DATE,
  fim DATE,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.produto_movimentos_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  canal TEXT,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.produto_variacoes TO anon, authenticated;
GRANT SELECT ON public.produto_ficha_tecnica TO anon, authenticated;
GRANT SELECT ON public.grupos_adicionais TO anon, authenticated;
GRANT SELECT ON public.produto_adicionais TO anon, authenticated;
GRANT SELECT ON public.produto_promocoes TO anon, authenticated;
GRANT ALL ON public.produto_variacoes TO service_role;
GRANT ALL ON public.produto_ficha_tecnica TO service_role;
GRANT ALL ON public.grupos_adicionais TO service_role;
GRANT ALL ON public.produto_adicionais TO service_role;
GRANT ALL ON public.produto_promocoes TO service_role;
GRANT ALL ON public.produto_movimentos_estoque TO service_role;
GRANT SELECT, INSERT ON public.produto_movimentos_estoque TO authenticated;

ALTER TABLE public.produto_variacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_ficha_tecnica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_adicionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_adicionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_promocoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_movimentos_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "variacoes publicas leitura" ON public.produto_variacoes FOR SELECT USING (true);
CREATE POLICY "staff gerencia variacoes" ON public.produto_variacoes FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "ficha publica leitura" ON public.produto_ficha_tecnica FOR SELECT USING (true);
CREATE POLICY "staff gerencia ficha" ON public.produto_ficha_tecnica FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "grupos adicionais leitura" ON public.grupos_adicionais FOR SELECT USING (true);
CREATE POLICY "staff gerencia grupos adicionais" ON public.grupos_adicionais FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "adicionais leitura" ON public.produto_adicionais FOR SELECT USING (true);
CREATE POLICY "staff gerencia adicionais" ON public.produto_adicionais FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "promocoes leitura" ON public.produto_promocoes FOR SELECT USING (true);
CREATE POLICY "staff gerencia promocoes" ON public.produto_promocoes FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "movimentos staff" ON public.produto_movimentos_estoque FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
