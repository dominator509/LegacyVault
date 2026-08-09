#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f .env ] || { echo "Stripe live-fire requires ignored .env" >&2; exit 1; }
pnpm exec vitest run tests/live-fire/stripe-sandbox.test.ts --passWithNoTests=false
echo "Stripe live-fire: ok"
