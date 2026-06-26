# Produção NorFood — VPS 8 GB

Guia para hospedar a plataforma em VPS com **Docker + Caddy + PM2 cluster**, Supabase na nuvem.

## Capacidade recomendada (VPS 8 GB)

| Cenário | Máx. tenants | Workers Node |
|---------|--------------|--------------|
| **App only** (Supabase externo) | **35** | 3 |
| Com Evolution API na mesma VPS | **15** | 2 |
| VPS 4 GB (perfil `vps-4gb`) | **18** | 2 |

Cada tenant = 1 restaurante. Estimativa para loja pequena/média:
- ~5 usuários simultâneos no painel
- KDS com refresh ~60s
- ~50–150 pedidos/dia

O limite é aplicado no `/admin` ao criar empresa (`NORFOOD_MAX_TENANTS`).

---

## Pré-requisitos

1. **VPS** Ubuntu 22.04/24.04, 8 GB RAM, 2+ vCPU, 80 GB SSD
2. **Domínio** apontando para o IP da VPS (ex.: `app.norfood.com.br`)
3. **Supabase** projeto dedicado + migrações em `supabase/migrations/`
4. Portas **80** e **443** abertas no firewall

---

## Deploy rápido

```bash
# Na VPS
sudo mkdir -p /opt/norfood
cd /opt/norfood
git clone SEU_REPO .

cp deploy/env.production.example deploy/.env
nano deploy/.env   # preencher Supabase, domínio, secrets

cd deploy
docker compose build
docker compose up -d
```

Health check:

```bash
curl -s https://app.seudominio.com.br/api/health | jq
```

---

## Variáveis importantes (`deploy/.env`)

| Variável | Valor VPS 8 GB |
|----------|----------------|
| `NITRO_PRESET` | `node-server` |
| `NORFOOD_CAPACITY_PROFILE` | `vps-8gb` |
| `NORFOOD_MAX_TENANTS` | `35` |
| `NORFOOD_PM2_INSTANCES` | `3` |
| `VITE_DEMO_MODE` | `false` |
| `PUBLIC_APP_URL` | `https://seu-dominio` |
| `DOMAIN` | `app.seudominio.com.br` |
| `ACME_EMAIL` | email Let's Encrypt |

Antes do deploy:

```bash
npm run check:production-env   # valida .env na raiz (dev) ou copie lógica
```

---

## Arquitetura

```
Internet → Caddy (:443 TLS) → norfood:3000 (PM2 × 3 workers)
                                    ↓
                              Supabase Cloud (Postgres + Auth)
```

- **Build:** Nitro preset `node-server` → `.output/server/index.mjs`
- **Processo:** PM2 cluster dentro do container (até 3 workers, ~900 MB cada)
- **Limite RAM container:** 6 GB (sobra ~2 GB para Caddy + SO)

---

## Comandos úteis

```bash
cd /opt/norfood/deploy

# Logs
docker compose logs -f norfood

# Atualizar versão
git pull
docker compose build --no-cache
docker compose up -d

# Status
docker compose ps
curl http://127.0.0.1:3000/api/health
```

---

## Webhooks (produção)

Atualize URLs no `.env` e nos painéis externos:

| Serviço | URL |
|---------|-----|
| Mercado Pago | `https://DOMAIN/api/mercadopago/webhook` |
| WhatsApp Meta | `https://DOMAIN/api/waba/webhook` |
| Evolution | `https://DOMAIN/api/whatsapp/webhook` |

---

## Aumentar capacidade

1. Subir `NORFOOD_MAX_TENANTS` (ex.: 50) se CPU/RAM estiverem folgadas
2. Aumentar `NORFOOD_PM2_INSTANCES` para 4 (monitorar RAM)
3. Upgrade VPS para 16 GB → perfil custom com `NORFOOD_MAX_TENANTS=70`
4. **Não** coloque Postgres na mesma VPS — use Supabase Pro

---

## Build local (sem Docker)

```bash
export NITRO_PRESET=node-server
export NODE_OPTIONS=--max-old-space-size=6144
npm ci
npm run build
NORFOOD_PM2_INSTANCES=3 npm run start:prod:pm2
```

Windows PowerShell:

```powershell
$env:NITRO_PRESET="node-server"
npm run build
npm run start:prod
```
