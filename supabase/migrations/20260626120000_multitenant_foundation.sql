-- Norfood SaaS — fundação multitenant (banco novo, sem dados legados)

CREATE TYPE public.tenant_role AS ENUM (
  'owner', 'admin', 'gerente', 'atendente', 'cozinha', 'entregador', 'financeiro', 'cliente'
);

CREATE TYPE public.tenant_status AS ENUM ('active', 'suspended', 'trial');

CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  subtitle TEXT,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#FF7A00',
  secondary_color TEXT NOT NULL DEFAULT '#111111',
  accent_color TEXT NOT NULL DEFAULT '#FF5A00',
  custom_domain TEXT UNIQUE,
  status public.tenant_status NOT NULL DEFAULT 'active',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  currency TEXT NOT NULL DEFAULT 'BRL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.tenant_role NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, role)
);

CREATE TABLE IF NOT EXISTS public.tenant_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone TEXT,
  address TEXT,
  description TEXT,
  delivery_fee_default NUMERIC(10, 2) NOT NULL DEFAULT 6,
  delivery_time_minutes INTEGER NOT NULL DEFAULT 40,
  pedido_minimo NUMERIC(10, 2) NOT NULL DEFAULT 15,
  loja_aberta BOOLEAN NOT NULL DEFAULT true,
  pontos_por_real NUMERIC(5, 2) NOT NULL DEFAULT 1,
  horario_automatico BOOLEAN NOT NULL DEFAULT true,
  pausa_imediata BOOLEAN NOT NULL DEFAULT false,
  payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb,
  store_appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
  menu_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenants TO anon, authenticated;
GRANT ALL ON public.tenants TO service_role;
GRANT SELECT ON public.tenant_users TO authenticated;
GRANT ALL ON public.tenant_users TO service_role;
GRANT SELECT ON public.tenant_settings TO anon, authenticated;
GRANT ALL ON public.tenant_settings TO service_role;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_tenant_ids()
RETURNS SETOF UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.tenant_users
  WHERE user_id = auth.uid() AND status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_staff(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE tenant_id = _tenant_id AND user_id = auth.uid() AND status = 'active'
      AND role IN ('owner','admin','gerente','atendente','cozinha','entregador','financeiro')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_manager(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE tenant_id = _tenant_id AND user_id = auth.uid() AND status = 'active'
      AND role IN ('owner','admin','gerente')
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_tenant_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_manager(UUID) TO authenticated;

DROP POLICY IF EXISTS "tenants public read active" ON public.tenants;
CREATE POLICY "tenants public read active"
  ON public.tenants FOR SELECT USING (status = 'active');

DROP POLICY IF EXISTS "tenant users read own" ON public.tenant_users;
CREATE POLICY "tenant users read own"
  ON public.tenant_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "tenant settings public read" ON public.tenant_settings;
CREATE POLICY "tenant settings public read"
  ON public.tenant_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "tenant settings staff manage" ON public.tenant_settings;
CREATE POLICY "tenant settings staff manage"
  ON public.tenant_settings FOR ALL TO authenticated
  USING (public.is_tenant_manager(tenant_id))
  WITH CHECK (public.is_tenant_manager(tenant_id));

-- tenant_id nas tabelas operacionais (após migrações base do schema Abelha fork)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'categorias','produtos','cupons','mesas','pedidos','entregas',
    'lancamentos_financeiros','bairros_entrega','produto_variacoes',
    'produto_ficha_tecnica','grupos_adicionais','produto_adicionais',
    'produto_promocoes','produto_movimentos_estoque','entregador_perfis',
    'motoboy_ocorrencias','motoboy_mensagens','motoboy_notificacoes',
    'entregadores_localizacao','rotas_entrega','empresa_fiscal',
    'fiscal_config','notas_fiscais','whatsapp_config','whatsapp_chats',
    'whatsapp_messages','waba_workspace','waba_config','waba_contacts',
    'waba_tags','waba_contact_tags','waba_custom_fields',
    'waba_contact_custom_values','waba_conversations','waba_messages',
    'waba_message_templates','waba_automations','waba_automation_steps',
    'waba_automation_logs','staff_atendimento_prefs','config_operacional',
    'horarios_funcionamento'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id)',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Seeds iniciais Norfood (banco vazio)
INSERT INTO public.tenants (id, name, slug, subtitle, primary_color, secondary_color, accent_color, timezone)
VALUES
  (
    'a0000000-0000-4000-8000-000000000001',
    'Norfood',
    'norfood',
    'Sistema de Delivery',
    '#FF7A00',
    '#111111',
    '#FF5A00',
    'America/Sao_Paulo'
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    'Restaurante Demo',
    'demo-restaurante',
    'Cliente exemplo',
    '#FF7A00',
    '#111111',
    '#FF5A00',
    'America/Sao_Paulo'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  subtitle = EXCLUDED.subtitle,
  updated_at = now();

INSERT INTO public.tenant_settings (tenant_id, description, pedido_minimo, delivery_fee_default)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Demonstração da plataforma Norfood.', 15, 6),
  ('a0000000-0000-4000-8000-000000000002', 'Restaurante de exemplo para onboarding.', 20, 5)
ON CONFLICT (tenant_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_categorias_tenant ON public.categorias(tenant_id);
CREATE INDEX IF NOT EXISTS idx_produtos_tenant ON public.produtos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant ON public.pedidos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON public.tenant_users(user_id);

DROP TRIGGER IF EXISTS trg_tenants_upd ON public.tenants;
CREATE TRIGGER trg_tenants_upd BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_users_upd ON public.tenant_users;
CREATE TRIGGER trg_tenant_users_upd BEFORE UPDATE ON public.tenant_users
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_settings_upd ON public.tenant_settings;
CREATE TRIGGER trg_tenant_settings_upd BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
