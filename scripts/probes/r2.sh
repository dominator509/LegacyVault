#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 "$R2_ENDPOINT" >/dev/null || [ $? -eq 22 ]
