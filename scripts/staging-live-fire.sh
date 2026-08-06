#!/usr/bin/env sh
set -eu
base_url="${1:?usage: sh scripts/staging-live-fire.sh https://named-app.example}"
case "$base_url" in
  https://*) ;;
  *) echo "ERROR: staging URL must use HTTPS" >&2; exit 1 ;;
esac
headers=$(curl -fsS --max-time 20 -D - -o /dev/null "$base_url/v1/households")
printf '%s' "$headers" | grep -Eq '^HTTP/[0-9.]+ 401'
printf '%s' "$headers" | grep -Eiq '^cache-control:.*no-store'
echo "staging live-fire: ok"
