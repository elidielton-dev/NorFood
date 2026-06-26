alter type public.pedido_status add value if not exists 'aguardando_pagamento';

alter table public.pedidos
  add column if not exists payment_provider text,
  add column if not exists payment_status text,
  add column if not exists payment_reference text,
  add column if not exists payment_id text,
  add column if not exists payment_checkout_url text,
  add column if not exists payment_last_event_at timestamptz;

create index if not exists pedidos_payment_reference_idx on public.pedidos (payment_reference);
create index if not exists pedidos_payment_id_idx on public.pedidos (payment_id);
