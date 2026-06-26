CREATE TABLE IF NOT EXISTS public.entregador_perfis (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_url TEXT,
  score NUMERIC(3,2) NOT NULL DEFAULT 5.0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  success_rate INTEGER NOT NULL DEFAULT 100,
  greeting TEXT NOT NULL DEFAULT 'Boa rota hoje.',
  vehicle TEXT NOT NULL DEFAULT 'Moto',
  plate TEXT NOT NULL DEFAULT '---0000',
  cep TEXT,
  address TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  emergency_phone TEXT,
  pix_key TEXT,
  support_phone TEXT NOT NULL DEFAULT '(11) 4000-2020',
  cnh TEXT,
  cnh_expiry DATE,
  vehicle_document TEXT,
  notify_new_orders BOOLEAN NOT NULL DEFAULT true,
  notify_occurrences BOOLEAN NOT NULL DEFAULT true,
  auto_online_after_login BOOLEAN NOT NULL DEFAULT true,
  online BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.motoboy_ocorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.motoboy_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id TEXT,
  text TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_whatsapp TEXT NOT NULL,
  quick_whatsapp TEXT NOT NULL,
  quick_sms TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.motoboy_notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,
  delivery_id UUID REFERENCES public.entregas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE ON public.entregador_perfis TO authenticated;
GRANT SELECT, INSERT ON public.motoboy_ocorrencias TO authenticated;
GRANT SELECT, INSERT ON public.motoboy_mensagens TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.motoboy_notificacoes TO authenticated;
GRANT ALL ON public.entregador_perfis TO service_role;
GRANT ALL ON public.motoboy_ocorrencias TO service_role;
GRANT ALL ON public.motoboy_mensagens TO service_role;
GRANT ALL ON public.motoboy_notificacoes TO service_role;

ALTER TABLE public.entregador_perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motoboy_ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motoboy_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motoboy_notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "motoboy ve e atualiza proprio perfil"
ON public.entregador_perfis
FOR ALL TO authenticated
USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "motoboy ve proprias ocorrencias"
ON public.motoboy_ocorrencias
FOR SELECT TO authenticated
USING (rider_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "motoboy registra propria ocorrencia"
ON public.motoboy_ocorrencias
FOR INSERT TO authenticated
WITH CHECK (rider_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "motoboy ve proprias mensagens"
ON public.motoboy_mensagens
FOR SELECT TO authenticated
USING (rider_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "motoboy registra propria mensagem"
ON public.motoboy_mensagens
FOR INSERT TO authenticated
WITH CHECK (rider_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "motoboy ve proprias notificacoes"
ON public.motoboy_notificacoes
FOR SELECT TO authenticated
USING (rider_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "motoboy cria proprias notificacoes"
ON public.motoboy_notificacoes
FOR INSERT TO authenticated
WITH CHECK (rider_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "motoboy atualiza proprias notificacoes"
ON public.motoboy_notificacoes
FOR UPDATE TO authenticated
USING (rider_id = auth.uid() OR public.is_staff(auth.uid()))
WITH CHECK (rider_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TRIGGER trg_entregador_perfis_upd
  BEFORE UPDATE ON public.entregador_perfis
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.entregador_perfis;
ALTER PUBLICATION supabase_realtime ADD TABLE public.motoboy_ocorrencias;
ALTER PUBLICATION supabase_realtime ADD TABLE public.motoboy_mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.motoboy_notificacoes;
