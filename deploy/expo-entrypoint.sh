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

echo "Iniciando Expo Metro (tunnel)..."
CI=0 npx expo start --port 8081 --tunnel 2>&1 | tee "$LOG_FILE" &
EXPO_PID=$!

echo "Aguardando tunnel ngrok (ate 180s)..."
for _ in $(seq 1 180); do
  if fetch_ngrok_exp_url 2>/dev/null; then
    break
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
  echo "AVISO: tunnel ngrok nao detectado; usando IP direto (requer porta 8081 aberta na AWS)."
fi

wait "$EXPO_PID"
