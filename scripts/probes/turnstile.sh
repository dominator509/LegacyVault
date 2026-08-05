#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 https://challenges.cloudflare.com/turnstile/v0/siteverify -d "secret=$TURNSTILE_SECRET_KEY" -d "response=preflight-invalid-token" >/dev/null
