#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -H "Authorization: Bearer $FLY_API_TOKEN" https://api.fly.io/graphql -H "content-type: application/json" --data-binary "{"query":"query { viewer { email } }"}" >/dev/null
