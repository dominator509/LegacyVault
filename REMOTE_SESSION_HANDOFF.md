# Remote Session Handoff

## Executive status

- Project: Legacy Vault Concierge
- End state: **MAXIMUM_ENGINEERING_COMPLETE**
- Handoff base commit: `3553d017fe000d08725df257a70bd2711f455ea7` (`[EP-010][M1] implement bounded scope`)
- Latest genuine green tag: none; no node verify sentinel has passed because preflight remains fail-closed
- Graph status: scheduler returns `NEXT EP-000`; EP-000 through EP-010 have independent engineering checkpoints, but 0/11 nodes are genuinely tagged done
- Independent engineering completion: **100% of work possible with available local services and the supplied DeepSeek credential**
- Production release status: **blocked; no release tag, staging mutation, production mutation, or fabricated approval exists**
- RUN_COMPLETE is not reached because Stripe, managed services, Turnstile, Resend, GHCR, Fly, production facts/secrets, legal/vendor/insurance evidence, staging proof, and manual production authorization are unavailable

The DeepSeek credential and authenticated inference are verified locally. The credential remains only in ignored `.env`; it is not committed or repeated here. Rotation after this session is an operator decision.

## Subsystem status

| Subsystem | Status | Completed behavior and passing proof | External verification / risk remaining |
|---|---|---|---|
| Repository/toolchain | Engineering complete | Pinned pnpm/Node, frozen lockfile, format/lint/type/build/security/reality/audit gates | CI run with full external inventory |
| PostgreSQL/domain | Engineering complete locally | Migrations, RLS, tenant-scoped repository, idempotence, invariant and real-DB tests | Neon roles, region, PITR, production capacity |
| Authentication/authorization | Engineering complete locally | Better Auth sessions, passkeys, TOTP, recovery, reset, revocation, verified identity, policy and Chrome proofs | Turnstile, physical-authenticator cross-browser, penetration test |
| Vault/documents | Engineering complete locally | Envelope encryption, MinIO upload/quarantine, ClamAV, OCR, evidence facts, decision lifecycle, retrieval | R2, hosted scanner/OCR capacity, staged real-file proof |
| Workers/reports/review | Engineering complete locally | BullMQ workflows, encrypted reports, annual review, notification evidence | Upstash, staging capacity, production delivery |
| AI gateway | Engineering complete; live provider passed | Consent, DLP, canonical prompts, schema, exact encrypted Redis cache, failure handling, cost/cache telemetry, real DeepSeek | Vendor/DPA/privacy/retention approval and production authorization |
| Billing | Engineering complete; provider live-fire deferred | Entitlements, checkout/portal adapters, signatures, event ordering, cancellation/refund state, replay protection | Stripe sandbox and approved price/trial/refund/quota terms |
| Email/messaging | Engineering complete locally | Production Resend adapter and real Mailpit workflows | Verified Resend domain, delivery/suppression/bounce; optional Twilio disabled |
| Privacy/compliance | Technical mechanisms complete to policy boundary | Consent, rights intake, export, delayed deletion, holds, audit, policy/control traceability | Counsel, identity/timing/appeal rules, shared-data disposition, processor deletion, evidence files |
| Observability/operations | Engineering complete locally | Content-free logs/metrics/traces, alerts, OTLP/Sentry adapters, runbooks, checksummed backup and real restore | External ingest/alerts, managed restore, production RPO/RTO and incident drill |
| Frontend/accessibility | Engineering complete locally | Core authenticated browser flow, semantic/focus/reflow/reduced-motion assertions | Manual screen reader, 200% zoom evidence, physical authenticator, staging proof |
| Performance | Local launch gate passes | Real DeepSeek/cache live-fire; k6 50 VUs, 250 authenticated iterations, zero failures, latest p95 264.20 ms | Production network, 1,000-profile, upload/job and Core Web Vitals evidence |
| Deployment/release | Engineering complete locally | Four digest-pinned OCI targets, immutable action SHAs, keyless signing workflow, Fly manifest, fail-fast combined image, migration and release rehearsals | GHCR signatures, named staging deployment/probes, prior signed rollback digest, production authorization |

Latest full local counts: 59 unit tests, 72 integration tests, 6 browser E2E tests, 39/39 contract operations with 1,727 generated cases, 21 Next.js routes, security static assertions, dependency audit, smoke, real DeepSeek live-fire, authenticated k6, local migration idempotence, backup/restore, and combined OCI runtime rehearsal all pass. The Schemathesis run still reports its visible authentication, missing-fixture, and schema-validation warnings; all generated cases pass, but authenticated stateful fixtures remain a hardening item rather than hidden evidence.

## Graph status

| Node | Status | Exact reason |
|---|---|---|
| EP-000 | Engineering continuation record; externally unverified | `preflight: ok` unavailable; scheduler remains here |
| EP-001 | Engineering complete but graph-unverified | Toolchain/materialization exists; dependency EP-000 has no green tag |
| EP-002 | Engineering complete but graph-unverified | Architecture/domain/security controls exist; prior dependency untagged |
| EP-003 | Engineering complete but graph-unverified | Real local persistence, RLS, migrations and services pass; managed providers unverified |
| EP-004 | Engineering complete but externally unverified | Core service workflows pass; exact verify stops at Stripe |
| EP-005 | Engineering complete but externally unverified | Real client/browser flow passes; dependency chain untagged |
| EP-006 | Engineering complete but externally unverified | Auth/security/compliance mechanisms pass locally; Turnstile and external evidence remain |
| EP-007 | Engineering complete but externally unverified | Full hardening and performance gates pass locally; exact verify stops at Stripe |
| EP-008 | M1 done; M2 externally unverified | Observability and operations pass locally; exact verify stops at Stripe |
| EP-009 | M1 done; M2 externally unverified | OCI/release/migration rehearsals pass; GHCR/Fly and exact verify unavailable |
| EP-010 | M1 done; M2 blocked by external ship gate | `production readiness: ok` cannot pass until all credentials, evidence and staging proofs exist |

No `NODE_DONE` event or `green/EP-*` tag was fabricated. Resume ordinary scheduling only after preflight passes.

## Deferred external requirements

The authoritative detailed register is `.agent/state/DEFERRED_EXTERNALS.md`. The minimum release-blocking actions are:

| ID | Service / approval | Variables or evidence | Minimum scope / exact operator action | Probe and validation |
|---|---|---|---|---|
| EXT-001 | Neon PostgreSQL | `DATABASE_URL`, `TEST_DATABASE_URL` | Dedicated non-superuser application and isolated test roles; confirm US region and PITR | `sh scripts/probes/database_url.sh`; then `sh scripts/preflight.sh` and `sh scripts/test-integration.sh` |
| EXT-002 | Upstash Redis | `REDIS_URL` | Dedicated TLS database | `sh scripts/probes/redis_url.sh`; then preflight and `sh scripts/live-fire.sh` |
| EXT-003 | DeepSeek governance | Existing ignored credential plus evidence | Archive approved vendor assessment, terms/privacy, DPA, locations, retention, secondary use and deletion; decide production authorization | `sh scripts/probes/deepseek_api_key.sh`; then preflight and live-fire |
| EXT-004 | Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` | One-bucket read/write/list credentials and lifecycle/region evidence | `sh scripts/probes/r2.sh`; then preflight, integration, and live-fire |
| EXT-005 | Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ESSENTIAL` | Test-mode key, webhook secret, approved Price and portal; deliver checkout, portal, subscription, cancellation and refund events | `sh scripts/probes/stripe.sh`; then preflight and live-fire |
| EXT-006 | Resend | `RESEND_API_KEY`, `EMAIL_FROM` | Send-only key and verified sender/domain; prove delivery, suppression and bounce handling | `sh scripts/probes/resend.sh`; then preflight and notification integration/live-fire |
| EXT-007 | Turnstile | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` plus scoped Cloudflare authorization | Create one approved-domain widget/siteverify path and wire the frontend after authenticated validation | `sh scripts/probes/turnstile.sh`; then preflight, auth E2E and live-fire |
| EXT-008/012 | Optional Sentry/OTLP | `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | Ingest-only endpoints with scrubbed project access; disable explicitly if not approved | Corresponding probe scripts; then observability integration and live-fire |
| EXT-009 | Fly | `FLY_API_TOKEN`, `FLY_APP_STAGING`, `FLY_APP_PRODUCTION` | Deploy permission only for exact existing named apps; dispatch staging workflow; production separately authorized | `sh scripts/probes/fly.sh`; then staging smoke/live-fire commands below |
| EXT-010 | GHCR | `GHCR_TOKEN`, `GHCR_OWNER` | Repository read and Packages write; dispatch release and archive Cosign transparency evidence | `sh scripts/probes/github.sh`; then `cosign verify ghcr.io/<owner>/<image>@sha256:<digest>` for all four images |
| EXT-013/014 | Production secrets and facts | Crypto/session keys, URLs, contacts, legal entity name/address | Generate independent production secrets in the secret manager and supply counsel-approved facts | Configuration inspection; preflight; cryptographic and production-readiness gates |
| EXT-015/019/020 | Legal/business evidence | Ten exact files in `PREFLIGHT.md`; approved retention, deletion, pricing/trial/refund/quota decisions | Obtain real approvals and archive exact named evidence; do not copy templates as approval | `sh scripts/preflight.sh`; then `sh scripts/production-readiness-check.sh` |
| EXT-016-018 | DNS/hosting/scanner/OCR | Named provider access and production resource evidence | Provision only after ship approval; prove WAF/certificates, private ClamAV, pinned OCR runtime and capacity | Provider inspection plus post-deploy smoke/live-fire and integration checks |

Optional Twilio remains disabled; no production feature depends on fake SMS delivery.

## Commands to resume

Local service state at handoff: the five Docker Compose dependencies are running and healthy. Recheck with `docker compose ps`. When they are no longer needed, run `docker compose down`; this stops the services while preserving the named development volumes.

From the repository root in Git Bash:

```sh
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
docker compose up -d --wait
pnpm db:migrate
sh scripts/preflight.sh
sh scripts/graph-next.sh
```

If a fresh local `.env` is needed, run `sh scripts/generate-local-env.sh` once before Compose; never overwrite or rotate an existing environment merely to rerun a gate.

After all required credentials and approvals are supplied:

```sh
sh scripts/preflight.sh
sh scripts/test-unit.sh
sh scripts/test-integration.sh
sh scripts/test-e2e.sh
sh scripts/contract-test.sh
sh scripts/build.sh
sh scripts/security-check.sh
sh scripts/dependency-audit.sh
sh scripts/reality-gate.sh
sh scripts/smoke-test.sh
sh scripts/live-fire.sh
sh scripts/local-migration-rehearsal.sh
sh scripts/verify.sh
sh scripts/production-readiness-check.sh
sh scripts/graph-next.sh
```

Staging is dispatched manually through `.github/workflows/release.yml` with an immutable semantic release tag. After it deploys:

```sh
sh scripts/staging-smoke.sh "https://<exact-named-staging-app>.fly.dev"
sh scripts/staging-live-fire.sh "https://<exact-named-staging-app>.fly.dev"
```

Production deployment remains the exact manual command in `DEPLOYMENT.md`:

```sh
fly deploy --app "$FLY_APP_PRODUCTION" --image "ghcr.io/$GHCR_OWNER/legacy-vault:$RELEASE_TAG" --strategy rolling
```

Post-deployment smoke/live-fire use the two staging scripts with the exact production HTTPS URL. Rollback first verifies and then deploys the recorded compatible digest:

```sh
cosign verify "ghcr.io/$GHCR_OWNER/legacy-vault@$PRIOR_IMAGE_DIGEST"
fly deploy --app "$FLY_APP_PRODUCTION" --image "ghcr.io/$GHCR_OWNER/legacy-vault@$PRIOR_IMAGE_DIGEST" --strategy rolling
```

## Legal and business actions

Obtain counsel approval of Terms, Privacy, AI disclosure, consent/withdrawal, privacy-right timing/identity/appeal, deletion/shared-data disposition, retention/backup periods, minors boundary, copyright/media rights and commercial terms. Obtain the DeepSeek assessment/terms/privacy/DPA, approved subprocessor register, DPIA, cyber and technology E&O insurance, incident contacts and drill, production region evidence, data-broker determination, production legal entity/address/contacts, Stripe price/trial/cancellation/refund/quota approval, verified sender/domain, and production security assessment. None is approved by this handoff.

## Known risks

- Production release is fully blocked; no staging deployment has occurred.
- Stripe, Turnstile, Resend, Neon, Upstash, R2, GHCR, Fly, DNS/WAF and managed restore behavior are not authenticated.
- Deletion intentionally stops at shared-data review; processor and backup expiry are not proven.
- Contract fuzzing lacks authenticated stateful fixtures and reports visible warnings.
- Manual accessibility, physical authenticator, production capacity, 1,000-profile topology, upload/job load, incident and rollback drills remain.
- DeepSeek live inference is technical proof only; vendor/privacy/legal approval is absent.
- Local OCI images include the full frozen workspace and development tooling to support TypeScript runtime package contracts; image minimization/SBOM policy should be reviewed before production approval, while signatures and dependency audit remain mandatory.

## Final operator checklist

1. Rotate or retain the supplied DeepSeek key according to operator policy; archive vendor and privacy approval before production use.
2. Approve commercial, retention, deletion/shared-data, privacy-right and legal entity facts; place all ten exact evidence files from `PREFLIGHT.md`.
3. Supply Stripe sandbox values first, run its probe and complete checkout/portal/webhook/refund/cancellation live-fire; this unlocks the earliest exact verify boundary.
4. Supply Turnstile and Resend credentials/domain evidence; complete auth abuse-prevention and delivery proofs.
5. Provision scoped Neon, Upstash and R2 staging resources and run every probe plus integration/live-fire.
6. Supply GHCR and exact Fly app access; dispatch the release workflow, record four signed digests, and pass staging HTTPS probes.
7. Complete manual accessibility, security, capacity, incident, managed restore and compatible rollback drills; archive evidence.
8. Run `sh scripts/production-readiness-check.sh`; proceed only on the literal `production readiness: ok` sentinel.
9. Create the blueprint-authorized release tag only after scheduler/node completion, explicitly authorize the manual production deploy, monitor for 24 hours, and retain the prior compatible signed digest.
