#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  echo "local export key repair: .env missing" >&2
  exit 1
fi
umask 077
replacement=$(openssl genpkey -algorithm ED25519 -outform DER 2>/dev/null | openssl base64 -A)
temporary=".env.export-key.$$"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
awk -v replacement="$replacement" '
  BEGIN { found = 0 }
  /^EXPORT_SIGNING_KEY=/ { print "EXPORT_SIGNING_KEY=" replacement; found = 1; next }
  { print }
  END { if (!found) exit 2 }
' .env > "$temporary"
mv "$temporary" .env
trap - EXIT HUP INT TERM
echo "local export key repair: ok"
