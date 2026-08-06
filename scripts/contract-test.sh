#!/usr/bin/env sh
set -eu

export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8

[ -f package.json ] || {
  echo "ERROR: run contract-test.sh from the repository root" >&2
  exit 1
}
command -v uvx >/dev/null 2>&1 || {
  echo "ERROR: uvx is required for the pinned Schemathesis contract gate" >&2
  exit 1
}

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
export LOCAL_ENGINEERING_MODE=true

require_loopback_url() {
  variable_name="$1"
  variable_value="$2"
  node -e '
    try {
      const host = new URL(process.argv[1]).hostname;
      process.exit(["127.0.0.1", "localhost", "[::1]"].includes(host) ? 0 : 1);
    } catch {
      process.exit(1);
    }
  ' "$variable_value" || {
    echo "ERROR: contract tests require a loopback $variable_name" >&2
    exit 1
  }
}

require_loopback_url DATABASE_URL "${DATABASE_URL:-}"
require_loopback_url REDIS_URL "${REDIS_URL:-}"
require_loopback_url R2_ENDPOINT "${R2_ENDPOINT:-}"

contract_port="${CONTRACT_TEST_PORT:-39101}"
contract_origin="http://127.0.0.1:${contract_port}"
contract_log=".agent/state/contract-api.log"
contract_pid=""

cleanup() {
  if [ -n "$contract_pid" ]; then
    kill "$contract_pid" >/dev/null 2>&1 || true
    wait "$contract_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

HOST=127.0.0.1 PORT="$contract_port" \
  pnpm --filter @legacy/api start >"$contract_log" 2>&1 &
contract_pid=$!

ready=false
attempt=0
while [ "$attempt" -lt 30 ]; do
  if curl --fail --silent "$contract_origin/openapi.json" >/dev/null 2>&1; then
    ready=true
    break
  fi
  if ! kill -0 "$contract_pid" >/dev/null 2>&1; then
    echo "ERROR: contract API exited before readiness; see $contract_log" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done

[ "$ready" = true ] || {
  echo "ERROR: contract API did not become ready within 30 seconds; see $contract_log" >&2
  exit 1
}

uvx --from schemathesis==4.24.3 schemathesis run \
  "$contract_origin/openapi.json" \
  --url "$contract_origin" \
  --phases coverage,fuzzing \
  --checks not_a_server_error,status_code_conformance,content_type_conformance,response_schema_conformance,missing_required_header \
  --max-examples 5 \
  --max-failures 1 \
  --workers 1 \
  --seed 20260805 \
  --generation-deterministic \
  --request-timeout 5 \
  --no-color

echo "contract test: ok"
