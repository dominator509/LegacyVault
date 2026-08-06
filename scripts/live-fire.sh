#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
pnpm live-fire

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
export LOCAL_ENGINEERING_MODE=true

performance_port="${PERFORMANCE_TEST_PORT:-39102}"
performance_origin="http://127.0.0.1:${performance_port}"
performance_log=".agent/state/performance-api.log"
performance_pid=""

cleanup() {
  if [ -n "$performance_pid" ]; then
    kill "$performance_pid" >/dev/null 2>&1 || true
    wait "$performance_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

HOST=0.0.0.0 PORT="$performance_port" API_BASE_URL="$performance_origin" \
  pnpm --filter @legacy/api start >"$performance_log" 2>&1 &
performance_pid=$!

ready=false
attempt=0
while [ "$attempt" -lt 30 ]; do
  if curl --fail --silent "$performance_origin/health/ready" >/dev/null 2>&1; then
    ready=true
    break
  fi
  if ! kill -0 "$performance_pid" >/dev/null 2>&1; then
    echo "ERROR: performance API exited before readiness; see $performance_log" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done

[ "$ready" = true ] || {
  echo "ERROR: performance API did not become ready within 30 seconds; see $performance_log" >&2
  exit 1
}

docker run --rm -i \
  -e K6_API_URL="http://host.docker.internal:${performance_port}" \
  -e K6_APP_ORIGIN="${APP_BASE_URL:-http://localhost:3000}" \
  -e K6_MAILPIT_URL="http://host.docker.internal:8025" \
  grafana/k6:2.0.0@sha256:a33a0cfdc4d2483d6b7a3a22e726a499ff2831a671a49239104cd34a9937523c run - <tests/performance/authenticated-api.js

echo "performance test: ok"
echo "live-fire: ok"
