# PREFLIGHT

This is the only interactive checkpoint. No graph node may begin until `sh scripts/preflight.sh` prints `preflight: ok`.

For the explicitly authorized 2026-08-05 unattended implementation continuation, missing external items remain release blockers recorded in `.agent/state/DEFERRED_EXTERNALS.md`. This does not change the preflight sentinel, mark EP-000 complete, or permit production deployment.

## Legal and governance approvals

The operator must place signed or approved evidence under `compliance/evidence/` for: counsel review of Terms and Privacy Policy; DeepSeek vendor risk assessment and current contract or terms snapshot; data protection impact assessment; subprocessor register; cyber and technology E&O insurance; incident contacts; retention schedule; production data-region verification; and a written determination that Legacy Vault is not operating as a data broker.

## Credential inventory

| Service | Purpose | Variables | Minimum scope | Cost | Probe | Fallback |
|---|---|---|---|---|---|---|
| Neon | Application and test PostgreSQL | DATABASE_URL, TEST_DATABASE_URL | Dedicated DB role, no superuser | Paid | scripts/probes/database_url.sh | None |
| Upstash | Queue and cache | REDIS_URL | Dedicated database | Paid | scripts/probes/redis_url.sh | None |
| DeepSeek | AI gateway | DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL | API inference only | Usage | scripts/probes/deepseek_api_key.sh | AI-disabled mode is allowed only in local development, never production |
| Cloudflare R2 | Encrypted objects | R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT | One bucket object read/write/list | Paid | scripts/probes/r2.sh | None |
| Stripe | Billing live-fire | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ESSENTIAL | Test mode for gates, production later | Fees | scripts/probes/stripe.sh | None |
| Resend | Transactional email | RESEND_API_KEY, EMAIL_FROM | Send from verified domain | Usage | scripts/probes/resend.sh | None |
| Cloudflare Turnstile | Abuse prevention | TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY | One widget | Free | scripts/probes/turnstile.sh | None |
| Sentry | Error monitoring | SENTRY_DSN | Project ingest | Paid/free | scripts/probes/sentry.sh | Optional in local only |
| Fly.io | Staging deployment | FLY_API_TOKEN, FLY_APP_STAGING, FLY_APP_PRODUCTION | Deploy named apps only | Paid | scripts/probes/fly.sh | None for EP-009 |
| GitHub | CI and image registry | GHCR_TOKEN, GHCR_OWNER | Packages write, repo read | Paid/free | scripts/probes/github.sh | None for EP-009 |
| Application | Cryptography and sessions | APP_ENCRYPTION_KEK, SESSION_SECRET, AUDIT_HMAC_KEY, EXPORT_SIGNING_KEY | 32-byte or stronger random values | Free | - | None |
| Operations | URLs and contacts | APP_BASE_URL, API_BASE_URL, SECURITY_CONTACT, PRIVACY_CONTACT, LEGAL_ENTITY_NAME, LEGAL_ENTITY_ADDRESS | Accurate production values | Free | - | None |
| Optional Twilio | SMS alerts | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER | Messaging only | Usage | scripts/probes/twilio.sh | Email and push only |
| OpenTelemetry | Traces and metrics | OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_HEADERS | Ingest only | Varies | scripts/probes/otel.sh | Local console exporter |

## Required evidence files

- compliance/evidence/counsel-approval.md
- compliance/evidence/deepseek-vendor-review.md
- compliance/evidence/deepseek-terms-snapshot.html
- compliance/evidence/deepseek-privacy-snapshot.html
- compliance/evidence/dpia-approved.md
- compliance/evidence/subprocessor-register-approved.md
- compliance/evidence/insurance-certificate.md
- compliance/evidence/retention-schedule-approved.md
- compliance/evidence/data-region-verification.md
- compliance/evidence/data-broker-determination.md

PREFLIGHT-TABLE-BEGIN
DATABASE_URL|REQUIRED|scripts/probes/database_url.sh
TEST_DATABASE_URL|REQUIRED|scripts/probes/database_url.sh
REDIS_URL|REQUIRED|scripts/probes/redis_url.sh
DEEPSEEK_API_KEY|REQUIRED|scripts/probes/deepseek_api_key.sh
DEEPSEEK_BASE_URL|REQUIRED|-
DEEPSEEK_MODEL|REQUIRED|-
R2_ACCOUNT_ID|REQUIRED|scripts/probes/r2.sh
R2_ACCESS_KEY_ID|REQUIRED|scripts/probes/r2.sh
R2_SECRET_ACCESS_KEY|REQUIRED|scripts/probes/r2.sh
R2_BUCKET|REQUIRED|scripts/probes/r2.sh
R2_ENDPOINT|REQUIRED|scripts/probes/r2.sh
STRIPE_SECRET_KEY|REQUIRED|scripts/probes/stripe.sh
STRIPE_WEBHOOK_SECRET|REQUIRED|-
STRIPE_PRICE_ESSENTIAL|REQUIRED|-
RESEND_API_KEY|REQUIRED|scripts/probes/resend.sh
EMAIL_FROM|REQUIRED|-
TURNSTILE_SITE_KEY|REQUIRED|-
TURNSTILE_SECRET_KEY|REQUIRED|scripts/probes/turnstile.sh
SENTRY_DSN|OPTIONAL|scripts/probes/sentry.sh
FLY_API_TOKEN|REQUIRED|scripts/probes/fly.sh
FLY_APP_STAGING|REQUIRED|-
FLY_APP_PRODUCTION|REQUIRED|-
GHCR_TOKEN|REQUIRED|scripts/probes/github.sh
GHCR_OWNER|REQUIRED|-
APP_ENCRYPTION_KEK|REQUIRED|-
SESSION_SECRET|REQUIRED|-
AUDIT_HMAC_KEY|REQUIRED|-
EXPORT_SIGNING_KEY|REQUIRED|-
APP_BASE_URL|REQUIRED|-
API_BASE_URL|REQUIRED|-
SECURITY_CONTACT|REQUIRED|-
PRIVACY_CONTACT|REQUIRED|-
LEGAL_ENTITY_NAME|REQUIRED|-
LEGAL_ENTITY_ADDRESS|REQUIRED|-
TWILIO_ACCOUNT_SID|OPTIONAL|scripts/probes/twilio.sh
TWILIO_AUTH_TOKEN|OPTIONAL|scripts/probes/twilio.sh
TWILIO_FROM_NUMBER|OPTIONAL|-
OTEL_EXPORTER_OTLP_ENDPOINT|OPTIONAL|scripts/probes/otel.sh
OTEL_EXPORTER_OTLP_HEADERS|OPTIONAL|-
PREFLIGHT-TABLE-END
