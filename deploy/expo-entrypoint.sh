#!/usr/bin/env bash
set -euo pipefail

URL_FILE="${EXPO_URL_FILE:-/data/expo-go-url.txt}"
LOG_FILE="/tmp/expo.log"
mkdir -p "$(dirname "$URL_FILE")"

echo "Iniciando Expo Metro (tunnel)..."
CI=0 npx expo start --port 8081 --tunnel 2>&1 | tee "$LOG_FILE" &
EXPO_PID=$!

echo "Aguardando URL do tunnel (ate 120s)..."
for _ in $(seq 1 120); do
  if [ -f "$LOG_FILE" ]; then
    URL=$(grep -oE 'exp://[^[:space:]]+' "$LOG_FILE" | head -1 || true)
    if [ -n "$URL" ]; then
      echo "$URL" > "$URL_FILE"
      echo "Expo Go URL: $URL"
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
  echo "AVISO: URL tunnel nao detectada; fallback exp://${EXPO_METRO_HOST:-15.228.214.190}:8081"
  echo "exp://${EXPO_METRO_HOST:-15.228.214.190}:8081" > "$URL_FILE"
fi

wait "$EXPO_PID"
