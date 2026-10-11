#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c SHA256SUMS
else
  shasum -a 256 -c SHA256SUMS
fi
docker info >/dev/null
docker load --input images.tar.gz
if [ ! -d source ]; then
  mkdir source
  tar -xzf source.tar.gz -C source
fi
docker compose --env-file source/infra/demo.env -f source/compose.demo.yml \
  -f source/compose.offline.yml up --no-build --pull never -d --wait --wait-timeout 600
task_address=$(docker compose --env-file source/infra/demo.env -f source/compose.demo.yml -f source/compose.offline.yml port frontend 8080)
echo "Diploma is ready: http://$task_address"
