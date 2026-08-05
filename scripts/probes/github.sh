#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -H "Authorization: Bearer $GHCR_TOKEN" https://api.github.com/user >/dev/null
