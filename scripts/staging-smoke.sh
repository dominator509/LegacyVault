#!/usr/bin/env sh
set -eu
base_url="${1:?usage: sh scripts/staging-smoke.sh https://named-app.example}"
case "$base_url" in
  https://*) ;;
  *) echo "ERROR: staging URL must use HTTPS" >&2; exit 1 ;;
esac
curl -fsS --max-time 20 "$base_url/" >/dev/null
curl -fsS --max-time 20 "$base_url/privacy-notice" >/dev/null
echo "staging smoke: ok"
