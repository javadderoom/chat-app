#!/usr/bin/env bash

set -euo pipefail

echo "[deploy] Starting deployment"

if ! command -v docker >/dev/null 2>&1; then
  echo "[deploy] Docker is not installed"
  exit 1
fi

if [ ! -f .env ]; then
  echo "[deploy] Missing .env file. Create it first (cp .env.example .env)."
  exit 1
fi

echo "[deploy] Pulling latest base images"
docker compose pull || true

wait_for_service() {
  local service="$1"
  local timeout_seconds="${2:-180}"
  local elapsed=0

  while [ "$elapsed" -lt "$timeout_seconds" ]; do
    local cid
    cid="$(docker compose ps -q "$service")"
    if [ -n "$cid" ]; then
      local state
      state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      if [ "$state" = "healthy" ] || [ "$state" = "running" ]; then
        echo "[deploy] $service is $state"
        return 0
      fi
      echo "[deploy] waiting for $service (state: ${state:-unknown})"
    else
      echo "[deploy] waiting for $service container to be created"
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done

  echo "[deploy] timeout waiting for $service"
  docker compose logs "$service" || true
  return 1
}

echo "[deploy] Starting postgres first"
docker compose up -d postgres
wait_for_service postgres 240

echo "[deploy] Running database schema push (npm run db:push)"
docker compose run --rm db-init

echo "[deploy] Starting remaining services"
docker compose up -d --build backend frontend nginx turn

echo "[deploy] Waiting for health checks"
wait_for_service backend 240
wait_for_service frontend 240
wait_for_service nginx 120
wait_for_service turn 120

echo "[deploy] Current status"
docker compose ps

echo "[deploy] Deployment complete"
echo "[deploy] App:    http://45.149.76.159"
echo "[deploy] Health: http://45.149.76.159/health"
