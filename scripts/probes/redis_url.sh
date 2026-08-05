#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 "${REDIS_HTTP_URL:-https://example.invalid}" >/dev/null
