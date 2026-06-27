#!/usr/bin/env bash
# Atualiza Norfood em produção: git pull + rebuild Docker
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/norfood}"

echo "==> NorFood update — $(date -Iseconds)"
cd "$APP_DIR"

if [ -d .git ]; then
  echo "==> git pull"
  git pull --ff-only
else
  echo "AVISO: $APP_DIR não é um repositório git."
fi

cd deploy
echo "==> docker compose build"
docker compose build

echo "==> docker compose up -d"
docker compose up -d

echo "==> status"
docker compose ps

DOMAIN="$(grep -E '^DOMAIN=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [ -n "$DOMAIN" ]; then
  echo "==> health"
  curl -fsS "https://${DOMAIN}/api/health" && echo ""
fi

echo "==> Concluído."
