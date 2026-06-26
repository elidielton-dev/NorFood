
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('cliente','garcom','cozinha','motoboy','gerente','admin');
CREATE TYPE public.pedido_status AS ENUM ('aberto','em_preparo','pronto','em_entrega','entregue','cancelado');
CREATE TYPE public.pedido_canal AS ENUM ('mesa','balcao','delivery','qrcode','ifood');
CREATE TYPE public.mesa_status AS ENUM ('livre','ocupada','fechando','reservada');
CREATE TYPE public.forma_pagamento AS ENUM ('dinheiro','pix','credito','debito','vale','online');
CREATE TYPE public.financeiro_tipo AS ENUM ('entrada','saida');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  telefone TEXT,
  avatar_url TEXT,
  pontos_fidelidade INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perfil próprio leitura" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "perfil próprio atualização" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "perfil próprio insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('garcom','cozinha','motoboy','gerente','admin'))
$$;

CREATE POLICY "ver próprios papéis" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admin gerencia papéis" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ TRIGGER: cria profile e papel padrão ao registrar ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, telefone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), NEW.raw_user_meta_data->>'telefone');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cliente');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ CARDÁPIO ============
CREATE TABLE public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  emoji TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categorias TO anon, authenticated;
GRANT ALL ON public.categorias TO service_role;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categorias públicas" ON public.categorias FOR SELECT USING (true);
CREATE POLICY "staff gerencia categorias" ON public.categorias FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  imagem_url TEXT,
  tempo_preparo_min INTEGER NOT NULL DEFAULT 10,
  calorias INTEGER,
  destaque BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  estoque INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.produtos TO anon, authenticated;
GRANT ALL ON public.produtos TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtos públicos" ON public.produtos FOR SELECT USING (ativo OR public.is_staff(auth.uid()));
CREATE POLICY "staff gerencia produtos" ON public.produtos FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_produtos_upd BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ CUPONS ============
CREATE TABLE public.cupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT,
  desconto_percentual NUMERIC(5,2),
  desconto_valor NUMERIC(10,2),
  valido_ate TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  usos INTEGER NOT NULL DEFAULT 0,
  usos_maximos INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cupons TO anon, authenticated;
GRANT ALL ON public.cupons TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.cupons TO authenticated;
ALTER TABLE public.cupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cupons ativos visíveis" ON public.cupons FOR SELECT USING (ativo OR public.is_staff(auth.uid()));
CREATE POLICY "staff gerencia cupons" ON public.cupons FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ MESAS ============
CREATE TABLE public.mesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero INTEGER NOT NULL UNIQUE,
  capacidade INTEGER NOT NULL DEFAULT 4,
  status mesa_status NOT NULL DEFAULT 'livre',
  qrcode_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mesas TO anon, authenticated;
GRANT ALL ON public.mesas TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.mesas TO authenticated;
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mesas visíveis" ON public.mesas FOR SELECT USING (true);
CREATE POLICY "staff gerencia mesas" ON public.mesas FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ PEDIDOS ============
CREATE TABLE public.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero SERIAL UNIQUE,
  cliente_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mesa_id UUID REFERENCES public.mesas(id) ON DELETE SET NULL,
  canal pedido_canal NOT NULL DEFAULT 'balcao',
  status pedido_status NOT NULL DEFAULT 'aberto',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  desconto NUMERIC(10,2) NOT NULL DEFAULT 0,
  taxa_entrega NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  forma_pagamento forma_pagamento,
  cupom_id UUID REFERENCES public.cupons(id) ON DELETE SET NULL,
  endereco TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pedidos TO authenticated;
GRANT ALL ON public.pedidos TO service_role;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cliente vê seus pedidos" ON public.pedidos FOR SELECT TO authenticated
  USING (cliente_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "cliente cria pedido próprio" ON public.pedidos FOR INSERT TO authenticated
  WITH CHECK (cliente_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "staff atualiza pedidos" ON public.pedidos FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_pedidos_upd BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.pedido_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco_unitario NUMERIC(10,2) NOT NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_itens TO authenticated;
GRANT ALL ON public.pedido_itens TO service_role;
ALTER TABLE public.pedido_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itens conforme pedido" ON public.pedido_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.cliente_id = auth.uid() OR public.is_staff(auth.uid()))));
CREATE POLICY "staff/cliente insere itens" ON public.pedido_itens FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.cliente_id = auth.uid() OR public.is_staff(auth.uid()))));
CREATE POLICY "staff atualiza itens" ON public.pedido_itens FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff deleta itens" ON public.pedido_itens FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- ============ ENTREGAS / MOTOBOY ============
CREATE TABLE public.entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  motoboy_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  endereco TEXT NOT NULL,
  bairro TEXT,
  distancia_km NUMERIC(6,2),
  taxa NUMERIC(10,2) NOT NULL DEFAULT 0,
  saiu_em TIMESTAMPTZ,
  entregue_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.entregas TO authenticated;
GRANT ALL ON public.entregas TO service_role;
ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entregas: cliente/staff/motoboy" ON public.entregas FOR SELECT TO authenticated USING (
  public.is_staff(auth.uid())
  OR motoboy_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.cliente_id = auth.uid())
);
CREATE POLICY "staff gerencia entregas" ON public.entregas FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_entregas_upd BEFORE UPDATE ON public.entregas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ FINANCEIRO ============
CREATE TABLE public.lancamentos_financeiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo financeiro_tipo NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT,
  valor NUMERIC(10,2) NOT NULL,
  forma forma_pagamento,
  pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos_financeiros TO authenticated;
GRANT ALL ON public.lancamentos_financeiros TO service_role;
ALTER TABLE public.lancamentos_financeiros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff vê financeiro" ON public.lancamentos_financeiros FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedido_itens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mesas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.entregas;
