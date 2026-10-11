#!/bin/sh
set -eu
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$task_root"
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /path/to/new/offline-folder" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit all source changes before exporting the offline archive." >&2
  exit 1
fi
if [ -e "$1" ]; then
  echo "Choose a new directory; existing archives will not be overwritten." >&2
  exit 1
fi
mkdir -p -- "$1"
task_destination=$(CDPATH= cd -- "$1" && pwd)
docker tag postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea avito-diploma-postgres:archive-v1
git archive --format=tar --output "$task_destination/source.tar" HEAD
gzip "$task_destination/source.tar"
docker save --output "$task_destination/images.tar" \
  avito-diploma-postgres:archive-v1 avito-diploma-init:archive-v1 \
  avito-diploma-backend:archive-v1 avito-diploma-frontend:archive-v1
gzip "$task_destination/images.tar"
cp scripts/demo/start-offline.sh "$task_destination/start-offline.sh"
chmod +x "$task_destination/start-offline.sh"
git rev-parse HEAD > "$task_destination/COMMIT.txt"
docker image inspect avito-diploma-init:archive-v1 avito-diploma-backend:archive-v1 \
  avito-diploma-frontend:archive-v1 avito-diploma-postgres:archive-v1 \
  --format '{{.RepoTags}} {{.Id}} {{.Os}}/{{.Architecture}}' > "$task_destination/IMAGES.txt"
cd "$task_destination"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum source.tar.gz images.tar.gz start-offline.sh COMMIT.txt IMAGES.txt > SHA256SUMS
else
  shasum -a 256 source.tar.gz images.tar.gz start-offline.sh COMMIT.txt IMAGES.txt > SHA256SUMS
fi
echo "Offline archive saved: $task_destination"
