#!/bin/bash
# Corrige pairing com count:0 na Evolution API (rodar na VPS com sudo onde necessario)
# Uso: bash fix-evolution-pairing-vps.sh

set -euo pipefail

APIKEY="${EVOLUTION_API_KEY:-AbelhaMel2026Segura}"
INSTANCE="${EVOLUTION_INSTANCE_NAME:-abelha-mel}"
BASE="http://localhost:8080"
PHONE="${1:-5587981769435}"

api() {
  curl -s -H "apikey: ${APIKEY}" -H "Content-Type: application/json" "$@"
}

echo "=== Evolution pairing fix ==="
echo "Instancia: ${INSTANCE} | Telefone: ${PHONE}"
echo ""

echo "--- 1) Imagem e env ---"
sudo docker inspect evolution_api --format 'Image: {{.Config.Image}}' 2>/dev/null || echo "Container evolution_api nao encontrado"
sudo docker exec evolution_api printenv 2>/dev/null | grep -E 'CONFIG_SESSION|AUTHENTICATION|QRCODE|DATABASE_PROVIDER' || true
echo ""

echo "--- 2) Estado atual ---"
api "${BASE}/instance/connectionState/${INSTANCE}" | jq . 2>/dev/null || api "${BASE}/instance/connectionState/${INSTANCE}"
echo ""

echo "--- 3) Logout ---"
api -X DELETE "${BASE}/instance/logout/${INSTANCE}"
echo ""
sleep 3

echo "--- 4) Recriar instancia limpa ---"
api -X DELETE "${BASE}/instance/delete/${INSTANCE}" || true
sleep 2
api -X POST "${BASE}/instance/create" -d "{\"instanceName\":\"${INSTANCE}\",\"qrcode\":true,\"integration\":\"WHATSAPP-BAILEYS\"}"
echo ""
sleep 3

echo "--- 5) Connect GET (pairing) ---"
api "${BASE}/instance/connect/${INSTANCE}?number=${PHONE}"
echo ""

echo "--- 6) Connect POST (pairing) ---"
api -X POST "${BASE}/instance/connect/${INSTANCE}" -d "{\"number\":\"${PHONE}\"}"
echo ""

echo "--- 7) Poll 5x (3s) ---"
for i in 1 2 3 4 5; do
  echo "tentativa $i:"
  api "${BASE}/instance/connect/${INSTANCE}?number=${PHONE}"
  echo ""
  sleep 3
done

echo "--- 8) Ultimas linhas do log ---"
sudo docker logs evolution_api --tail 40 2>&1 || true

echo ""
echo "=== Se ainda count:0 ==="
echo "1) Atualize a imagem: atendai/evolution-api:v2.2.3 ou evoapicloud/evolution-api:v2.3.5"
echo "2) No .env do docker-compose:"
echo "   CONFIG_SESSION_PHONE_CLIENT=Chrome"
echo "   CONFIG_SESSION_PHONE_NAME=Chrome"
echo "   # v2.3+: REMOVA CONFIG_SESSION_PHONE_VERSION (busca automatica)"
echo "   # v2.2.x: CONFIG_SESSION_PHONE_VERSION=2.3000.1033773198"
echo "3) Reinicie: sudo docker compose up -d --force-recreate"
echo "4) Rode este script de novo"
