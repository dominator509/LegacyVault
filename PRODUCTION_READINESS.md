# Production Readiness

Status: **MAXIMUM_ENGINEERING_COMPLETE candidate; production release blocked.** No node is green because the immutable preflight still fails at the first unavailable required external, currently Stripe. No release tag or production deployment is authorized.

## Core outcome evidence

| # | Outcome | Engineering status | Release proof still required |
|---:|---|---|---|
| 1 | Household and guided inventory | Pass locally | Staging and production browser proof |
| 2 | Upload, quarantine, classify, redact, extract, and decide facts | Pass locally across real MinIO, ClamAV, OCR, API, worker, and browser flows | Production R2/scanner capacity and staged real-file proof |
| 3 | Maintain allowed record categories without prohibited secrets | Pass locally with category authorization, DLP, encryption, and tests | Staged pilot review |
| 4 | Versioned family emergency guide from confirmed facts | Pass locally | Staging worker/rendering proof |
| 5 | Versioned executor packet with uncertainty labels | Pass locally | Staging worker/rendering proof |
| 6 | Invite and revoke category-limited helper access | Pass locally | Authenticated Resend delivery and staging browser proof |
| 7 | Compartmentalized emergency access | Pass locally | Fraud-review operations and staged pilot |
| 8 | Encrypted portable export | Pass locally | Production R2 download and import/restore rehearsal |
| 9 | Verifiable deletion and processor requests | Active-system workflow passes and fails closed at shared-data review | Approved disposition, processor contracts/deletion confirmations, backup-expiry proof |
| 10 | Annual stale/expiry/contradiction/missing review | Pass locally | Staging worker and delivery proof |
| 11 | Consent-bound AI interview with outbound DLP | Pass against real DeepSeek | Vendor/legal approval and production authorization |
| 12 | Content-free AI cache/cost/redaction telemetry | Pass locally with real DeepSeek and encrypted Redis exact cache | Approved OTLP/Sentry ingest if enabled and production dashboard/alert proof |
| 13 | Purchase and manage subscription | Domain, adapter, signed webhook, ordering, cancellation, refund, and entitlement engineering pass | Authenticated Stripe sandbox and approved commercial terms |
| 14 | Authenticated privacy-rights workflow and audit trail | Pass locally | Approved identity/timing/appeal policy and staging delivery proof |

## Ship gate

Production requires one fresh `sh scripts/production-readiness-check.sh` result of `production readiness: ok`. That command transitively requires `verify: ok`, including preflight, all test classes, build, security, dependency, reality, smoke, and live-fire gates, and then verifies every evidence filename declared in `PREFLIGHT.md`.

The release also requires signed GHCR digests for API, web, worker, and combined release images; named Fly staging deployment; staging smoke/live-fire; current Privacy/Terms/control traceability; accessibility manual evidence; performance evidence; incident contacts and drill; managed backup/restore; prior compatible signed rollback digest; approved vendor/subprocessor/region/retention/DPIA/counsel/insurance/data-broker evidence; and an explicit human production authorization.

DeepSeek authenticated inference and current local live-fire pass, but that is not vendor approval. Local MinIO, PostgreSQL, Valkey, Mailpit, ClamAV, OCR, backup/restore, and OCI rehearsals are production-equivalent engineering evidence only, not proof of Neon, Upstash, R2, Resend, Fly, GHCR, or production operations.

Production remains manual. The exact deployment and rollback commands are in `DEPLOYMENT.md`. They must not run until the ship sentinel and all recorded approvals pass.
