ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS troco_para NUMERIC(10,2);
