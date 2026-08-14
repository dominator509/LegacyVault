#!/usr/bin/env sh
set -eu
testing_secret=1x0000000000000000000000000000000AA
if [ "$TURNSTILE_SECRET_KEY" = "$testing_secret" ]; then
  token=XXXX.DUMMY.TOKEN.XXXX
  expected=true
else
  token=preflight-invalid-token
  expected=false
fi
result=$(curl -fsS --max-time 20 https://challenges.cloudflare.com/turnstile/v0/siteverify -d "secret=$TURNSTILE_SECRET_KEY" -d "response=$token")
if ! printf '%s' "$result" | jq -e --argjson expected "$expected" '
  .success == $expected and
  ((.["error-codes"] // []) | index("invalid-input-secret") | not) and
  ((.["error-codes"] // []) | index("missing-input-secret") | not)
' >/dev/null; then
  printf '%s' "$result" | jq -c '{success, "error-codes": .["error-codes"]}' >&2
  exit 1
fi
