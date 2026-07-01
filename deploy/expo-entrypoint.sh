#!/usr/bin/env bash
set -euo pipefail

URL_FILE="${EXPO_URL_FILE:-/data/expo-go-url.txt}"
LOG_FILE="/tmp/expo.log"
mkdir -p "$(dirname "$URL_FILE")"

write_url() {
  echo "$1" > "$URL_FILE"
  echo "Expo Go URL: $1"
}

fetch_ngrok_exp_url() {
  local json http_url host
  json=$(curl -fsS http://127.0.0.1:4040/api/tunnels 2>/dev/null || true)
  if [ -z "$json" ]; then
    return 1
  fi
  http_url=$(printf '%s' "$json" | grep -o '"public_url":"http://[^"]*exp\.direct"' | head -1 | cut -d'"' -f4)
  if [ -z "$http_url" ]; then
    return 1
  fi
  host=${http_url#http://}
  write_url "exp://${host}:80"
}

resolve_exp_url_from_manifest() {
  local json host
  json=$(curl -fsS "http://127.0.0.1:8081/index.exp?platform=android" 2>/dev/null || true)
  if [ -z "$json" ]; then
    return 1
  fi
  host=$(printf '%s' "$json" | grep -o '"debuggerHost":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -z "$host" ]; then
    return 1
  fi
  if echo "$host" | grep -q 'exp.direct'; then
    write_url "exp://${host}:80"
  else
    write_url "exp://${host}"
  fi
}

refresh_public_url() {
  if resolve_exp_url_from_manifest; then
    return 0
  fi
  fetch_ngrok_exp_url || true
}

if [ -n "${DOMAIN:-}" ]; then
  export EXPO_PACKAGER_PROXY_URL="https://${DOMAIN}"
  echo "Iniciando Expo Metro com proxy HTTPS (${EXPO_PACKAGER_PROXY_URL})..."
  CI=0 npx expo start --port 8081 --host lan 2>&1 | tee "$LOG_FILE" &
else
  echo "Iniciando Expo Metro (tunnel)..."
  CI=0 npx expo start --port 8081 --tunnel 2>&1 | tee "$LOG_FILE" &
fi

EXPO_PID=$!

echo "Aguardando Metro ficar pronto (ate 180s)..."
for _ in $(seq 1 180); do
  if curl -fsS http://127.0.0.1:8081/status >/dev/null 2>&1; then
    if refresh_public_url; then
      break
    fi
  fi
  if ! kill -0 "$EXPO_PID" 2>/dev/null; then
    echo "Expo encerrou inesperadamente."
    cat "$LOG_FILE" || true
    exit 1
  fi
  sleep 1
done

if [ ! -s "$URL_FILE" ]; then
  write_url "exp://${EXPO_METRO_HOST:-15.228.214.190}:8081"
  echo "AVISO: nao foi possivel resolver URL publica do Metro."
fi

while kill -0 "$EXPO_PID" 2>/dev/null; do
  sleep 60
  refresh_public_url || true
done

wait "$EXPO_PID"
