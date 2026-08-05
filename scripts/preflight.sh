#!/usr/bin/env sh
set -eu
fail() { echo "preflight: FAIL - $1" >&2; exit 1; }
[ -f AGENTS.md ] && [ -d .agent ] || fail "run from repository root"
for f in AGENTS.md COMMANDS.md PREFLIGHT.md .env.example .agent/GRAPH.md .agent/LOOPS.md .agent/state/LEDGER.md .agent/reality-patterns .agent/reality-allow; do [ -f "$f" ] || fail "missing required file: $f"; done
for t in git awk grep sed curl jq openssl node corepack pnpm docker; do command -v "$t" >/dev/null 2>&1 || fail "missing required tool: $t"; done
[ -f .env ] || fail "missing .env (copy .env.example, fill every REQUIRED value, rerun)"
set -a; . ./.env; set +a
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
awk '/^PREFLIGHT-TABLE-BEGIN$/{t=1;next} /^PREFLIGHT-TABLE-END$/{t=0} t && NF' PREFLIGHT.md > "$TMP"
[ -s "$TMP" ] || fail "PREFLIGHT-TABLE missing or empty"
if command -v timeout >/dev/null 2>&1 && timeout --version 2>/dev/null | grep -q "GNU coreutils"; then
  TCMD="timeout 30"
else
  TCMD=""
fi
while IFS='|' read -r var req probe; do
  eval "val=\${$var:-}"
  if [ -z "$val" ]; then [ "$req" = OPTIONAL ] && continue; fail "env var not set: $var"; fi
  if [ "$probe" != "-" ]; then [ -f "$probe" ] || fail "missing probe: $probe"; $TCMD sh "$probe" >/dev/null 2>&1 || fail "credential probe failed: $var"; fi
done < "$TMP"
echo "preflight: ok"
