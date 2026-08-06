#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive

[ -f compose.yaml ] || {
  echo "ERROR: run local-backup.sh from the repository root" >&2
  exit 1
}

backup_directory=".agent/state/backups"
mkdir -p "$backup_directory"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_directory/legacy-vault-$timestamp.dump"

docker compose exec -T postgres pg_dump \
  --username=legacy_app \
  --dbname=legacy_vault \
  --format=custom \
  --no-owner \
  --no-privileges >"$backup_file"

[ -s "$backup_file" ] || {
  echo "ERROR: backup artifact is empty" >&2
  exit 1
}
sha256sum "$backup_file" >"$backup_file.sha256"
echo "backup: ok $backup_file"
