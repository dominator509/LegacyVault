#!/usr/bin/env sh
set -eu
psql_bin=$(command -v psql || true)
if [ -z "$psql_bin" ] && [ -x "/c/Program Files/PostgreSQL/17/bin/psql.exe" ]; then
  psql_bin="/c/Program Files/PostgreSQL/17/bin/psql.exe"
fi
[ -n "$psql_bin" ] || { echo "test database probe: PostgreSQL 17 client not found" >&2; exit 1; }
export PGCONNECT_TIMEOUT=20
"$psql_bin" -v ON_ERROR_STOP=1 -Atqc "select current_database()" "$TEST_DATABASE_URL" | grep -qx legacy_vault_test
