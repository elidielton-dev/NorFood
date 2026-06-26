ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_cliente_id_fkey,
  DROP CONSTRAINT IF EXISTS pedidos_entregador_id_fkey;

ALTER TABLE public.entregas
  DROP CONSTRAINT IF EXISTS entregas_motoboy_id_fkey;

ALTER TABLE public.rotas_entrega
  DROP CONSTRAINT IF EXISTS rotas_entrega_entregador_id_fkey;

ALTER TABLE public.entregadores_localizacao
  DROP CONSTRAINT IF EXISTS entregadores_localizacao_entregador_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_cliente_id_fkey
  FOREIGN KEY (cliente_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL
  NOT VALID,
  ADD CONSTRAINT pedidos_entregador_id_fkey
  FOREIGN KEY (entregador_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.entregas
  ADD CONSTRAINT entregas_motoboy_id_fkey
  FOREIGN KEY (motoboy_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.rotas_entrega
  ADD CONSTRAINT rotas_entrega_entregador_id_fkey
  FOREIGN KEY (entregador_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.entregadores_localizacao
  ADD CONSTRAINT entregadores_localizacao_entregador_id_fkey
  FOREIGN KEY (entregador_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.profiles
  VALIDATE CONSTRAINT profiles_id_fkey;

ALTER TABLE public.user_roles
  VALIDATE CONSTRAINT user_roles_user_id_fkey;

ALTER TABLE public.pedidos
  VALIDATE CONSTRAINT pedidos_cliente_id_fkey;

ALTER TABLE public.pedidos
  VALIDATE CONSTRAINT pedidos_entregador_id_fkey;

ALTER TABLE public.entregas
  VALIDATE CONSTRAINT entregas_motoboy_id_fkey;

ALTER TABLE public.rotas_entrega
  VALIDATE CONSTRAINT rotas_entrega_entregador_id_fkey;

ALTER TABLE public.entregadores_localizacao
  VALIDATE CONSTRAINT entregadores_localizacao_entregador_id_fkey;
