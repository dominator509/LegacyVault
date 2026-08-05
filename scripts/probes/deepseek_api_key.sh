#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -H "Authorization: Bearer $DEEPSEEK_API_KEY" "$DEEPSEEK_BASE_URL/models" >/dev/null
