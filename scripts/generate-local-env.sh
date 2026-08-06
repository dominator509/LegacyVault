#!/usr/bin/env sh
set -eu

rotate="${1:-}"
if [ -e .env ] && [ "$rotate" != "--rotate" ]; then
  echo "local env: exists (refusing to overwrite without --rotate)" >&2
  exit 1
fi
umask 077

random_b64() { openssl rand -base64 48 | tr -d '\r\n'; }
random_b64_32() { openssl rand -base64 32 | tr -d '\r\n'; }
random_hex() { openssl rand -hex 24; }

postgres_password=$(random_hex)
test_password=$(random_hex)
redis_password=$(random_hex)
s3_access=$(openssl rand -hex 12)
s3_secret=$(random_b64)
encryption_kek=$(random_b64_32)
session_secret=$(random_b64)
audit_key=$(random_b64)
export_key=$(openssl genpkey -algorithm ED25519 -outform DER 2>/dev/null | openssl base64 -A)

{
  printf '%s\n' '# Generated development-only configuration. Never use these values in production.'
  printf 'NODE_ENV=development\nLOCAL_ENGINEERING_MODE=true\nHOST=127.0.0.1\nPORT=3001\nLOG_LEVEL=info\n'
  printf 'LOCAL_POSTGRES_PASSWORD=%s\nLOCAL_TEST_DB_PASSWORD=%s\n' "$postgres_password" "$test_password"
  printf 'DATABASE_URL=postgresql://legacy_app:%s@127.0.0.1:15432/legacy_vault\n' "$postgres_password"
  printf 'TEST_DATABASE_URL=postgresql://legacy_test:%s@127.0.0.1:15432/legacy_vault_test\n' "$test_password"
  printf 'LOCAL_REDIS_PASSWORD=%s\nREDIS_URL=redis://default:%s@127.0.0.1:16379\n' "$redis_password" "$redis_password"
  printf '%s\n' 'WORKFLOW_QUEUE_NAME=legacy-workflows-development'
  printf 'LOCAL_S3_ACCESS_KEY=%s\nLOCAL_S3_SECRET_KEY=%s\n' "$s3_access" "$s3_secret"
  printf 'R2_ACCOUNT_ID=local\nR2_ACCESS_KEY_ID=%s\nR2_SECRET_ACCESS_KEY=%s\nR2_BUCKET=legacy-vault-local\nR2_ENDPOINT=http://127.0.0.1:19000\n' "$s3_access" "$s3_secret"
  printf '%s\n' 'CLAMAV_HOST=127.0.0.1' 'CLAMAV_PORT=13310' 'OCR_EXECUTABLE='
  printf 'APP_ENCRYPTION_KEK=%s\nSESSION_SECRET=%s\nAUDIT_HMAC_KEY=%s\nEXPORT_SIGNING_KEY=%s\n' "$encryption_kek" "$session_secret" "$audit_key" "$export_key"
  printf '%s\n' 'DEEPSEEK_API_KEY=' 'DEEPSEEK_BASE_URL=https://api.deepseek.com' 'DEEPSEEK_MODEL=deepseek-v4-flash'
  printf '%s\n' 'STRIPE_SECRET_KEY=' 'STRIPE_WEBHOOK_SECRET=' 'STRIPE_PRICE_ESSENTIAL='
  printf '%s\n' 'RESEND_API_KEY=' 'EMAIL_FROM="Legacy Vault <notices@localhost.invalid>"'
  printf '%s\n' 'TURNSTILE_SITE_KEY=' 'TURNSTILE_SECRET_KEY=' 'SENTRY_DSN='
  printf '%s\n' 'FLY_API_TOKEN=' 'FLY_APP_STAGING=' 'FLY_APP_PRODUCTION=' 'GHCR_TOKEN=' 'GHCR_OWNER='
  printf '%s\n' 'APP_BASE_URL=http://127.0.0.1:3000' 'API_BASE_URL=http://127.0.0.1:3001'
  printf '%s\n' 'SECURITY_CONTACT=security@localhost.invalid' 'PRIVACY_CONTACT=privacy@localhost.invalid'
  printf '%s\n' 'LEGAL_ENTITY_NAME="LOCAL DEVELOPMENT ONLY"' 'LEGAL_ENTITY_ADDRESS="LOCAL DEVELOPMENT ONLY"'
  printf '%s\n' 'TWILIO_ACCOUNT_SID=' 'TWILIO_AUTH_TOKEN=' 'TWILIO_FROM_NUMBER='
  printf '%s\n' 'OTEL_EXPORTER_OTLP_ENDPOINT=' 'OTEL_EXPORTER_OTLP_HEADERS='
} > .env

echo "local env: ok"
