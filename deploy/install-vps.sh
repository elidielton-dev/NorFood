#!/usr/bin/env bash
# Bootstrap rápido em Ubuntu 22.04/24.04 (VPS 8 GB)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/norfood}"
REPO_URL="${REPO_URL:-}"

echo "==> NorFood VPS setup"

if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin necessário."
  exit 1
fi

mkdir -p "$APP_DIR/deploy"
cd "$APP_DIR"

if [ -n "$REPO_URL" ] && [ ! -d .git ]; then
  git clone "$REPO_URL" .
fi

if [ ! -f deploy/.env ]; then
  cp deploy/env.production.example deploy/.env
  echo ""
  echo "Edite $APP_DIR/deploy/.env antes de subir (domínio, Supabase, secrets)."
  echo "  nano $APP_DIR/deploy/.env"
  exit 0
fi

cd deploy
docker compose build --no-cache
docker compose up -d

echo ""
echo "Deploy iniciado. Verifique:"
echo "  docker compose -f $APP_DIR/deploy/docker-compose.yml ps"
echo "  curl -s https://\$(grep ^DOMAIN= .env | cut -d= -f2)/api/health"
