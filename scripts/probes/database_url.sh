#!/usr/bin/env sh
set -eu
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "select 1" | grep -qx 1
