# Upgrade Evolution API na VPS (corrigir count:0 no pairing)

## Diagnostico atual (Abelha & Mel)

- Imagem: `atendai/evolution-api:v2.1.1` (antiga)
- `CONFIG_SESSION_PHONE_VERSION=2.3000.1023204200` (expirada)
- Pairing retorna `{"count":0}`
- Webhook 401 no Vercel (corrigido no app — aceita token da instancia)

## Passo 1 — Achar docker-compose

```bash
sudo find /home /opt /root -name "docker-compose*.yml" 2>/dev/null | xargs grep -l evolution 2>/dev/null
```

## Passo 2 — Editar .env (mesma pasta do compose)

```env
# Imagem — atualizar no docker-compose.yml:
# image: atendai/evolution-api:v2.2.3

AUTHENTICATION_API_KEY=AbelhaMel2026Segura

CONFIG_SESSION_PHONE_CLIENT=Chrome
CONFIG_SESSION_PHONE_NAME=Chrome
CONFIG_SESSION_PHONE_VERSION=2.3000.1033773198

DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://evolution:evolutionpass@evolution_postgres:5432/evolution?schema=public
```

> Em v2.3+, remova `CONFIG_SESSION_PHONE_VERSION` (busca automatica).

## Passo 3 — Reiniciar

```bash
cd /caminho/do/compose
sudo docker compose pull
sudo docker compose up -d --force-recreate
```

## Passo 4 — Testar pairing

```bash
APIKEY="AbelhaMel2026Segura"
curl -s -X DELETE -H "apikey: $APIKEY" http://localhost:8080/instance/delete/abelha-mel
sleep 2
curl -s -X POST -H "apikey: $APIKEY" -H "Content-Type: application/json" \
  http://localhost:8080/instance/create \
  -d '{"instanceName":"abelha-mel","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'
sleep 3
curl -s -H "apikey: $APIKEY" "http://localhost:8080/instance/connect/abelha-mel?number=5587981769435"
```

Deve retornar `"pairingCode":"XXXXXXXX"`.

## Alternativa rapida (so versao WhatsApp, sem upgrade de imagem)

```bash
# Editar .env e mudar apenas:
CONFIG_SESSION_PHONE_VERSION=2.3000.1033773198
sudo docker compose up -d --force-recreate evolution_api
```

Se ainda `count:0`, faca upgrade para v2.2.3.
