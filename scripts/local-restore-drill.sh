#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive

[ -f compose.yaml ] || {
  echo "ERROR: run local-restore-drill.sh from the repository root" >&2
  exit 1
}

backup_file="${1:-}"
if [ -z "$backup_file" ]; then
  for candidate in .agent/state/backups/legacy-vault-*.dump; do
    [ -f "$candidate" ] && backup_file="$candidate"
  done
fi
case "$backup_file" in
  .agent/state/backups/legacy-vault-*.dump) ;;
  *)
    echo "ERROR: restore drill accepts only .agent/state/backups/legacy-vault-*.dump" >&2
    exit 1
    ;;
esac
[ -s "$backup_file" ] || {
  echo "ERROR: backup artifact is missing or empty" >&2
  exit 1
}
if [ -f "$backup_file.sha256" ]; then
  sha256sum --check "$backup_file.sha256" >/dev/null
fi

drill_database="legacy_restore_$(date -u +%Y%m%d%H%M%S)_$$"
case "$drill_database" in
  legacy_restore_[0-9]*) ;;
  *)
    echo "ERROR: generated restore database name is invalid" >&2
    exit 1
    ;;
esac

cleanup() {
  docker compose exec -T postgres dropdb --username=legacy_app --if-exists "$drill_database" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker compose exec -T postgres createdb --username=legacy_app "$drill_database"
docker compose exec -T postgres pg_restore \
  --username=legacy_app \
  --dbname="$drill_database" \
  --no-owner \
  --no-privileges <"$backup_file"

signature_sql="select (select count(*) from schema_migrations)::text || ':' || (select count(*) from organizations)::text || ':' || (select count(*) from households)::text || ':' || (select count(*) from workflow_runs)::text"
source_signature=$(docker compose exec -T postgres psql --username=legacy_app --dbname=legacy_vault --tuples-only --no-align --command "$signature_sql")
restore_signature=$(docker compose exec -T postgres psql --username=legacy_app --dbname="$drill_database" --tuples-only --no-align --command "$signature_sql")
[ "$source_signature" = "$restore_signature" ] || {
  echo "ERROR: restored canonical table counts do not match source" >&2
  exit 1
}

echo "restore drill: ok"
