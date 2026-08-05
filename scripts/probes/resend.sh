#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains >/dev/null
