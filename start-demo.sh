#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v docker >/dev/null 2>&1; then
  echo "Install Docker Desktop (or Docker Engine with Compose) first." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Start Docker Desktop / Docker Engine and run this command again." >&2
  exit 1
fi
docker compose --env-file infra/demo.env -f compose.demo.yml up --build -d --wait --wait-timeout 600
task_address=$(docker compose --env-file infra/demo.env -f compose.demo.yml port frontend 8080)
echo "Diploma is ready: http://$task_address"
