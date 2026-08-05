#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 "${SENTRY_DSN%/*}" >/dev/null || [ $? -eq 22 ]
