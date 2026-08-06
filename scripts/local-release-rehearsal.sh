#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive

[ -f .env ] || { echo "ERROR: generate the ignored local .env first" >&2; exit 1; }
container_name="legacy-vault-release-rehearsal"
cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
cleanup

set -a
. ./.env
set +a
container_database_url=$(printf '%s' "$DATABASE_URL" | sed 's#127.0.0.1:15432#postgres:5432#')
container_redis_url=$(printf '%s' "$REDIS_URL" | sed 's#127.0.0.1:16379#valkey:6379#')

docker run --detach \
  --name "$container_name" \
  --network legacy-vault-local_default \
  --env-file .env \
  --env NODE_ENV=development \
  --env LOCAL_ENGINEERING_MODE=true \
  --env HOST=0.0.0.0 \
  --env API_BASE_URL=http://127.0.0.1:3001 \
  --env APP_BASE_URL=http://127.0.0.1:13000 \
  --env DATABASE_URL="$container_database_url" \
  --env REDIS_URL="$container_redis_url" \
  --env R2_ENDPOINT=http://minio:9000 \
  --env CLAMAV_HOST=clamav \
  --publish 127.0.0.1:13000:3000 \
  --publish 127.0.0.1:13001:3001 \
  legacy-vault:local >/dev/null

attempt=0
until curl -fsS --max-time 3 http://127.0.0.1:13000/ >/dev/null 2>&1 && \
  curl -fsS --max-time 3 http://127.0.0.1:13001/health/live >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 40 ]; then
    docker logs --tail 100 "$container_name" >&2
    echo "ERROR: release image did not become ready" >&2
    exit 1
  fi
  sleep 1
done
docker inspect --format '{{.State.Running}}' "$container_name" | grep -qx true
echo "local release rehearsal: ok"
