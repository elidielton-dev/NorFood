-- Parte 1/2: novo valor no enum (deve ser commitado antes de usar 'pending')
-- PostgreSQL não permite referenciar um enum recém-adicionado na mesma transação.

ALTER TYPE public.tenant_status ADD VALUE IF NOT EXISTS 'pending';
