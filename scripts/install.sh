#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
corepack enable
if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile
else
  pnpm install --no-frozen-lockfile
fi
echo "install: ok"
