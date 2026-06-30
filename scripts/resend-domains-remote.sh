#!/bin/bash
set -euo pipefail
ENV_FILE="${1:-/opt/norfood/deploy/.env}"
KEY=$(grep '^RESEND_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "$KEY" ]; then echo "RESEND_API_KEY not found"; exit 1; fi
CMD="${2:-list}"
DOMAIN="${3:-}"

case "$CMD" in
  list)
    curl -s -H "Authorization: Bearer $KEY" https://api.resend.com/domains
    ;;
  create)
    curl -s -X POST https://api.resend.com/domains \
      -H "Authorization: Bearer $KEY" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"$DOMAIN\",\"region\":\"sa-east-1\"}"
    ;;
  send-test)
    FROM="${3:-Norfood <contato@norfood.com.br>}"
    TO="${4:-}"
    if [ -z "$TO" ]; then echo "informe email destino"; exit 1; fi
    curl -s -X POST https://api.resend.com/emails \
      -H "Authorization: Bearer $KEY" \
      -H "Content-Type: application/json" \
      -d "{\"from\":\"$FROM\",\"to\":[\"$TO\"],\"subject\":\"Teste Norfood Resend\",\"html\":\"<p>Teste de envio.</p>\"}"
    ;;
  *)
    echo "usage: $0 [env-file] list|create <domain>"
    exit 1
    ;;
esac
