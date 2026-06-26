-- Cole no Supabase SQL Editor para habilitar o modulo fiscal

CREATE TABLE IF NOT EXISTS public.empresa_fiscal (
  id TEXT PRIMARY KEY DEFAULT 'default',
  cnpj TEXT,
  razao_social TEXT,
  nome_fantasia TEXT,
  inscricao_estadual TEXT,
  inscricao_municipal TEXT,
  crt INTEGER NOT NULL DEFAULT 1,
  cnae TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  codigo_municipio_ibge TEXT,
  municipio TEXT,
  uf TEXT,
  cep TEXT,
  telefone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fiscal_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  nfce_habilitada BOOLEAN NOT NULL DEFAULT false,
  nfe_habilitada BOOLEAN NOT NULL DEFAULT false,
  ambiente TEXT NOT NULL DEFAULT 'homologacao',
  serie_nfce INTEGER NOT NULL DEFAULT 1,
  proximo_numero_nfce INTEGER NOT NULL DEFAULT 1,
  csc_id TEXT,
  csc_token_encrypted TEXT,
  certificado_pfx_encrypted TEXT,
  certificado_senha_encrypted TEXT,
  certificado_valido_ate TIMESTAMPTZ,
  certificado_titular TEXT,
  certificado_cnpj TEXT,
  certificado_instalado_em TIMESTAMPTZ,
  emitir_automatico_pdv BOOLEAN NOT NULL DEFAULT false,
  emitir_automatico_delivery BOOLEAN NOT NULL DEFAULT false,
  emitir_automatico_mesas BOOLEAN NOT NULL DEFAULT false,
  provider TEXT NOT NULL DEFAULT 'sefaz',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS ncm TEXT,
  ADD COLUMN IF NOT EXISTS cfop TEXT DEFAULT '5102',
  ADD COLUMN IF NOT EXISTS csosn TEXT DEFAULT '102',
  ADD COLUMN IF NOT EXISTS origem INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gtin TEXT;

-- Tabela base (caso migration antiga nao tenha sido aplicada em producao)
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
  protocolo_sefaz TEXT,
  codigo_status INTEGER,
  motivo_rejeicao TEXT,
  qrcode_url TEXT,
  serie TEXT,
  consumidor_cpf TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS protocolo_sefaz TEXT,
  ADD COLUMN IF NOT EXISTS codigo_status INTEGER,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao TEXT,
  ADD COLUMN IF NOT EXISTS qrcode_url TEXT,
  ADD COLUMN IF NOT EXISTS serie TEXT,
  ADD COLUMN IF NOT EXISTS consumidor_cpf TEXT,
  ADD COLUMN IF NOT EXISTS xml_autorizado TEXT;

UPDATE public.fiscal_config SET provider = 'sefaz' WHERE provider = 'webmania';

INSERT INTO public.empresa_fiscal (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.fiscal_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.empresa_fiscal TO authenticated;
GRANT ALL ON public.empresa_fiscal TO service_role;
ALTER TABLE public.empresa_fiscal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff gerencia empresa fiscal" ON public.empresa_fiscal;
CREATE POLICY "staff gerencia empresa fiscal"
  ON public.empresa_fiscal FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.fiscal_config TO authenticated;
GRANT ALL ON public.fiscal_config TO service_role;
ALTER TABLE public.fiscal_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff gerencia fiscal config" ON public.fiscal_config;
CREATE POLICY "staff gerencia fiscal config"
  ON public.fiscal_config FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.notas_fiscais TO authenticated;
GRANT ALL ON public.notas_fiscais TO service_role;
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff gerencia notas fiscais" ON public.notas_fiscais;
CREATE POLICY "staff gerencia notas fiscais"
  ON public.notas_fiscais FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
