-- Campos extras do formulário de produto (modal de cadastro)

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS codigo_barras TEXT,
  ADD COLUMN IF NOT EXISTS frete_gratis BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS primeiro_pedido BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pesavel BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quero_desconto BOOLEAN NOT NULL DEFAULT false;
