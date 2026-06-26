# Norfood — Sistema de Delivery (SaaS Multitenant)

Plataforma profissional para restaurantes: PDV, cozinha, mesas, delivery, financeiro, cardápio digital e gestão multitenant.

**Projeto:** `C:\Users\elidi\Downloads\Norfood`  
**Independente** do Abelha & Mel Ops (repositório/cliente separado).

## Acesso rápido

| Ambiente | URL |
|----------|-----|
| Landing | `/` |
| Painel demo | `/t/norfood/dashboard` |
| Loja demo | `/loja/norfood` |
| Login | `/login` |
| Admin plataforma | `/admin` |

## Rodar local

```bash
npm install
cp .env.example .env
# Configure um Supabase NOVO (projeto dedicado Norfood)
npm run dev
```

## Supabase (projeto novo)

1. Crie um projeto Supabase só para Norfood
2. Aplique todas as migrações em `supabase/migrations/` (ordem cronológica)
3. Rode o seed: `npm run seed:tenants`

## Criar novo restaurante (tenant)

Pelo painel admin: **/admin** → Nova empresa (recomendado).

Ou manualmente no Supabase:
```sql
INSERT INTO tenants (id, name, slug, subtitle, primary_color, secondary_color, accent_color)
VALUES (gen_random_uuid(), 'Meu Restaurante', 'meu-restaurante', 'Delivery', '#FF7A00', '#111111', '#FF5A00');

INSERT INTO tenant_settings (tenant_id) VALUES ('<uuid-do-tenant>');
INSERT INTO tenant_users (tenant_id, user_id, role) VALUES ('<uuid>', '<auth-user-uuid>', 'owner');
```

Acesse: `/t/meu-restaurante/dashboard` e `/loja/meu-restaurante`

## Variáveis de ambiente

Ver `.env.example` — use credenciais do **Supabase Norfood**, não do Abelha & Mel.

## Modo demonstração

`VITE_DEMO_MODE=true` — opera localmente sem depender de permissões completas.

## Produção (VPS 8 GB)

Ver guia completo: **[deploy/PRODUCTION.md](deploy/PRODUCTION.md)**

- **Capacidade:** até **35 restaurantes** (tenants) sem gargalo
- **Stack:** Docker + Caddy + PM2 (3 workers) + Supabase Cloud
- **Health:** `GET /api/health`

```bash
cp deploy/env.production.example deploy/.env
cd deploy && docker compose up -d --build
```
