#!/usr/bin/env sh
set -eu

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set test_password="$LOCAL_TEST_DB_PASSWORD" <<'SQL'
CREATE ROLE legacy_test LOGIN PASSWORD :'test_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE DATABASE legacy_vault_test OWNER legacy_test;
REVOKE ALL ON DATABASE legacy_vault_test FROM PUBLIC;
SQL
