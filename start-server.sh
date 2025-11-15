#!/usr/bin/env bash

set -euo pipefail

SERVICE_NAME="screenshot-server"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "❌ Docker Compose is required to run the screenshot server."
  echo "Install Docker Desktop or the docker-compose plugin and try again."
  exit 1
fi

echo "🚀 Starting screenshot canvas server via Docker Compose..."
echo "   - Service: ${SERVICE_NAME}"
echo "   - URL:     http://localhost:8080/screenshot-canvas.html"

"${COMPOSE_CMD[@]}" up --build --detach "${SERVICE_NAME}"

cleaned_up=false

cleanup() {
  if [ "$cleaned_up" = true ]; then
    return
  fi
  cleaned_up=true
  echo
  echo "🛑 Stopping screenshot canvas server..."
  "${COMPOSE_CMD[@]}" down --remove-orphans
}

trap cleanup INT TERM

echo "📜 Streaming container logs. Press Ctrl+C to stop."
set +e
"${COMPOSE_CMD[@]}" logs -f --tail=20 "${SERVICE_NAME}"
EXIT_CODE=$?
set -e

cleanup

exit "$EXIT_CODE"
