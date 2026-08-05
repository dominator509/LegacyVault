#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  echo "local encryption key repair: .env missing" >&2
  exit 1
fi
umask 077
replacement=$(openssl rand -base64 32 | tr -d '\r\n')
temporary=".env.encryption-key.$$"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
awk -v replacement="$replacement" '
  BEGIN { found = 0 }
  /^APP_ENCRYPTION_KEK=/ { print "APP_ENCRYPTION_KEK=" replacement; found = 1; next }
  { print }
  END { if (!found) exit 2 }
' .env > "$temporary"
mv "$temporary" .env
trap - EXIT HUP INT TERM
echo "local encryption key repair: ok"
