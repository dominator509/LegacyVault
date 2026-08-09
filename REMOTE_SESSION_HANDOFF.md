# Remote Session Handoff

## Executive status

- Project: Legacy Vault Concierge
- End state: **MAXIMUM_ENGINEERING_COMPLETE**
- Handoff base commit: `f6d99cab4c7945d85b10cd53a375fb73961d49d5` (`ci: bootstrap local storage deterministically`); the final documentation commit is reported by `git rev-parse HEAD`
- Latest genuine green tag: none; no node verify sentinel has passed because preflight remains fail-closed
- Graph status: scheduler returns `NEXT EP-000`; EP-000 through EP-010 have independent engineering checkpoints, but 0/11 nodes are genuinely tagged done
- Independent engineering completion: **maximum locally verified completion after six repository hardening passes**
- Production release status: **blocked; no release tag, staging mutation, production mutation, or fabricated approval exists**
- RUN_COMPLETE is not reached because delivered Stripe webhook/payment lifecycle proof, production Resend domain/events, Turnstile, R2/Redis/hosted-database/GHCR/Fly production values and staging proofs are absent, and the required safe evidence-reference files have not been placed under `compliance/evidence/`

The DeepSeek credential and authenticated inference were previously verified locally. The credential remains only in ignored `.env`; it is not committed or repeated here and should be rotated because it was pasted into chat. The Stripe test secret passed authenticated account, Price, Checkout create/retrieve/expire, and disposable-customer billing-portal probes on 2026-08-08. The supplied webhook secret is stored only in ignored `.env`; no value is committed or repeated here. The supplied publishable key is not a blueprint-declared or consumed variable and was therefore not added. The supplied Resend key passed an authenticated domains probe plus one synthetic production-adapter send/retrieve against Resend-owned test addresses; it also remains only in ignored `.env` and should be rotated because it was pasted into chat. The operator states that counsel, all policies and retention policies, Stripe pricing, insurance, incident contacts, regions, data-broker status, external security review, hosting, and database provisions are complete. Those statements are recorded as operator assertions, not fabricated evidence; safe reference records and authenticated probes are still required by the immutable ship gate.

## Subsystem status

| Subsystem | Status | Completed behavior and passing proof | External verification / risk remaining |
|---|---|---|---|
| Repository/toolchain | Engineering complete | Pinned pnpm/Node, frozen lockfile, format/lint/type/build/security/reality/audit gates; credential-free real-service PR CI with deterministic MinIO bootstrap and pinned OCR pull passed in GitHub run `31247202155` | No engineering item remains; strict credentialed ship workflow remains release-gated |
| PostgreSQL/domain | Engineering complete locally | Application and isolated test roles authenticate; migrations, RLS, tenant-scoped repository, idempotence, invariant and real-DB tests plus checksummed backup/restore rehearsal pass | Hosted roles, region, PITR, production capacity |
| Authentication/authorization | Engineering complete locally | Better Auth sessions, passkeys, TOTP, recovery, reset, revocation, explicit authenticated-user SQL ownership plus forced RLS, policy and Chrome proofs | Turnstile and physical-authenticator cross-browser proof; operator asserts external security approval |
| Vault/documents | Engineering complete locally | Envelope encryption, MinIO upload/quarantine, ClamAV, OCR, evidence facts, decision lifecycle, retrieval | R2, hosted scanner/OCR capacity, staged real-file proof |
| Workers/reports/review | Engineering complete locally | BullMQ workflows, encrypted reports, annual review, notification evidence | Upstash, staging capacity, production delivery |
| AI gateway | Engineering complete; live provider passed | Consent, DLP, canonical prompts, schema, exact encrypted Redis cache, failure handling, cost/cache telemetry, real DeepSeek | Vendor/DPA/privacy/retention approval and production authorization |
| Billing | Engineering complete; safe Stripe sandbox live-fire passes | Entitlements, adapters, signatures, event ordering, cancellation/refund state and replay protection; authenticated account/Price, synthetic Checkout create/retrieve/expire, and disposable-customer portal proofs | Delivered webhook plus paid subscription/cancellation/refund lifecycle proof |
| Email/messaging | Engineering complete; safe Resend sandbox live-fire passes | Production Resend adapter, real Mailpit workflows, authenticated domains probe, and production-adapter send/retrieve through Resend-owned test addresses | Verified production domain and delivered webhook/suppression/bounce proof; optional Twilio disabled |
| Privacy/compliance | Technical mechanisms complete to policy boundary | Consent, rights intake, export, delayed deletion, holds, audit, policy/control traceability | Operator asserts approvals; safe reference files, exact production values, shared-data disposition and processor deletion proof remain |
| Observability/operations | Engineering complete locally | Content-free logs/metrics/traces, alerts, OTLP/Sentry adapters, runbooks, checksummed backup and real restore | External ingest/alerts, managed restore, production RPO/RTO and incident drill |
| Frontend/accessibility | Engineering complete locally | Restrictive CSP/browser headers; 7 browser E2Es; axe serious/critical zero; semantic/focus/reflow/reduced-motion assertions | Manual screen reader, 200% zoom, physical authenticator, staging CWV proof |
| Performance | Local launch gate passes | Real DeepSeek/cache live-fire; k6 50 VUs, 250 authenticated iterations, 750/750 checks, zero HTTP failures, protected endpoint p95 329.86 ms | Production network, 1,000-profile, upload/job and trace-based Core Web Vitals evidence |
| Deployment/release | Engineering complete locally | Four digest-pinned OCI targets, immutable action SHAs, keyless signing workflow, Fly manifest, fail-fast combined image, migration and release rehearsals | GHCR signatures, named staging deployment/probes, prior signed rollback digest, production authorization |

Latest full local counts: 67 unit tests, 76 integration tests, 7 browser E2E tests, 39/39 contract operations with 1,727/1,727 generated cases, 21 Next.js routes, security static assertions, zero known dependency vulnerabilities, smoke, prior real DeepSeek live-fire, authenticated Stripe Checkout/portal live-fire, authenticated Resend send/retrieve live-fire, authenticated k6, local migration idempotence, checksummed backup/restore comparison, and combined OCI runtime rehearsal all pass. A completed Standard security scan found one low-severity membership-query defense-in-depth gap; it is fixed and protected by SQL, integration, and static assertions. Schemathesis still reports visible unauthenticated/missing-fixture/schema warnings; authenticated success paths are covered separately, but authenticated stateful fuzzing remains deferred rather than hidden.

## Six hardening passes

1. Supply chain, secrets, dependencies and CI: pinned actions/tooling, secret scan, least-privilege release workflow, immutable run labels/digests, zero known dependency vulnerabilities.
2. Authentication, authorization, tenant isolation and cryptography: Better Auth/MFA/passkeys, forced RLS, non-superuser roles, AEAD/signature/key-zeroing proofs.
3. API, storage, workers, AI, billing and privacy: HTTPS/TLS/provider-host enforcement, adapter contracts, quarantine/OCR, consent/DLP/cache isolation, webhook ordering and privacy workflows.
4. Recovery, observability, backups and operations: real readiness dependencies, content-free telemetry, fail-closed release, migration/backup/restore and rollback rehearsals.
5. Browser, accessibility and performance: CSP/isolation/security headers, 44 px targets, axe/browser flows, production build and authenticated 50-VU k6.
6. Final repository security/readiness: completed scan `bced9d83-df13-4f6b-9af4-c4ee5894f44d`, one low finding fixed, deterministic PR CI separated from the credentialed ship gate.

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
| EXT-001 | Hosted PostgreSQL | `DATABASE_URL`, `TEST_DATABASE_URL` | Local application/test roles and backup/restore pass; supply hosted non-superuser URLs and confirm region/PITR | `sh scripts/probes/database_url.sh`; then `sh scripts/preflight.sh` and `sh scripts/test-integration.sh` |
| EXT-002 | Upstash Redis | `REDIS_URL` | Dedicated TLS database | `sh scripts/probes/redis_url.sh`; then preflight and `sh scripts/live-fire.sh` |
| EXT-003 | DeepSeek governance | Existing ignored credential plus evidence | Archive approved vendor assessment, terms/privacy, DPA, locations, retention, secondary use and deletion; decide production authorization | `sh scripts/probes/deepseek_api_key.sh`; then preflight and live-fire |
| EXT-004 | Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` | One-bucket read/write/list credentials and lifecycle/region evidence | `sh scripts/probes/r2.sh`; then preflight, integration, and live-fire |
| EXT-005 | Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ESSENTIAL` | Account, Price, Checkout and portal probes pass; configure a webhook endpoint, then deliver subscription, cancellation and refund events | `sh scripts/probes/stripe.sh`; `sh scripts/stripe-live-fire.sh`; then endpoint-specific delivered-webhook validation |
| EXT-006 | Resend | `RESEND_API_KEY`, `EMAIL_FROM` | Sandbox send/retrieve passes; rotate the chat-exposed key, verify the production sender domain, and prove delivery-event/suppression/bounce handling | `sh scripts/probes/resend.sh`; `sh scripts/resend-live-fire.sh`; then production-domain event validation |
| EXT-007 | Turnstile | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` plus scoped Cloudflare authorization | Create one approved-domain widget/siteverify path and wire the frontend after authenticated validation | `sh scripts/probes/turnstile.sh`; then preflight, auth E2E and live-fire |
| EXT-008/012 | Optional Sentry/OTLP | `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | Ingest-only endpoints with scrubbed project access; disable explicitly if not approved | Corresponding probe scripts; then observability integration and live-fire |
| EXT-009 | Fly | `FLY_API_TOKEN`, `FLY_APP_STAGING`, `FLY_APP_PRODUCTION` | Deploy permission only for exact existing named apps; dispatch staging workflow; production separately authorized | `sh scripts/probes/fly.sh`; then staging smoke/live-fire commands below |
| EXT-010 | GHCR | `GHCR_TOKEN`, `GHCR_OWNER` | Repository read and Packages write; dispatch release and archive Cosign transparency evidence | `sh scripts/probes/github.sh`; then `cosign verify ghcr.io/<owner>/<image>@sha256:<digest>` for all four images |
| EXT-013/014 | Production secrets and facts | Crypto/session keys, URLs, contacts, legal entity name/address | Generate independent production secrets in the secret manager and supply counsel-approved facts | Configuration inspection; preflight; cryptographic and production-readiness gates |
| EXT-015/019/020 | Legal/business evidence | Ten exact safe reference files in `PREFLIGHT.md`; exact approved periods/terms | Operator asserts approval; add owner/date/hash/access-location/disposition references and inject exact production values without committing restricted originals | `sh scripts/preflight.sh`; then `sh scripts/production-readiness-check.sh` |
| EXT-016-018 | DNS/hosting/scanner/OCR | Named provider access and production resource evidence | Provision only after ship approval; prove WAF/certificates, private ClamAV, pinned OCR runtime and capacity | Provider inspection plus post-deploy smoke/live-fire and integration checks |

Optional Twilio remains disabled; no production feature depends on fake SMS delivery.

## Commands to resume

Local service state at handoff: the five Docker Compose dependencies are running and healthy. Recheck with `docker compose ps`. When they are no longer needed, run `docker compose down`; this stops the services while preserving the named development volumes.

From the repository root in Git Bash:

```sh
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
docker compose up -d --wait
pnpm exec tsx scripts/bootstrap-local-storage.ts
pnpm db:migrate
sh scripts/preflight.sh
sh scripts/graph-next.sh
```

If a fresh local `.env` is needed, run `sh scripts/generate-local-env.sh` once before Compose; never overwrite or rotate an existing environment merely to rerun a gate.

After all required credentials and approvals are supplied:

```sh
sh scripts/preflight.sh
sh scripts/lint.sh
sh scripts/format-check.sh
sh scripts/typecheck.sh
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
sh scripts/local-release-rehearsal.sh
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
cosign verify "ghcr.io/$GHCR_OWNER/legacy-vault@$RELEASE_IMAGE_DIGEST"
fly deploy --app "$FLY_APP_PRODUCTION" --image "ghcr.io/$GHCR_OWNER/legacy-vault@$RELEASE_IMAGE_DIGEST" --strategy rolling
```

Post-deployment smoke/live-fire use the two staging scripts with the exact production HTTPS URL. Rollback first verifies and then deploys the recorded compatible digest:

```sh
cosign verify "ghcr.io/$GHCR_OWNER/legacy-vault@$PRIOR_IMAGE_DIGEST"
fly deploy --app "$FLY_APP_PRODUCTION" --image "ghcr.io/$GHCR_OWNER/legacy-vault@$PRIOR_IMAGE_DIGEST" --strategy rolling
```

## Legal and business actions

Operator assertions received: counsel approved all policies and retention policies; Stripe pricing and insurance are handled; incident contacts exist in a hard-copy book; regions and the data-broker determination are finalized; an external security team approved the build; hosting and database provisions exist. Remaining engineering handoff action is evidentiary and configurational: create the exact ten safe reference records named by `PREFLIGHT.md`, include owner/date/immutable reference/controlled location/disposition, inject exact approved periods/terms/contacts/URLs, and run the probes. This handoff does not claim the underlying approvals are absent; it claims only that the repository gate cannot verify them yet.

## Known risks

- Production release is fully blocked; no staging deployment has occurred.
- Stripe delivered webhooks/payment lifecycle, Turnstile, production Resend domain/events, hosted PostgreSQL/Redis/R2, GHCR, Fly, DNS/WAF and managed restore behavior have not been authenticated from this workspace, even where provisioning is operator-asserted.
- Deletion intentionally stops at shared-data review; processor and backup expiry are not proven.
- Contract fuzzing lacks authenticated stateful fixtures and reports visible warnings.
- Manual accessibility, physical authenticator, production capacity, 1,000-profile topology, upload/job load, incident and rollback drills remain.
- DeepSeek live inference is technical proof; the repository still lacks the required vendor/privacy reference records.
- Local OCI images include the full frozen workspace and development tooling to support TypeScript runtime package contracts; image minimization/SBOM policy should be reviewed before production approval, while signatures and dependency audit remain mandatory.

## Final operator checklist

1. Rotate or retain the supplied DeepSeek key according to operator policy; archive vendor and privacy approval before production use.
2. Convert the asserted approvals into the ten safe reference files from `PREFLIGHT.md` and inject exact approved retention, pricing, contact, legal entity and URL values.
3. Configure the Stripe test webhook endpoint and complete delivered subscription/refund/cancellation lifecycle proof. Account, exact Price, Checkout, and customer-portal live-fire already pass.
4. Supply Turnstile credentials; rotate the supplied Resend key, verify the production sender domain, and complete auth abuse-prevention plus email delivery-event proofs.
5. Provision scoped Neon, Upstash and R2 staging resources and run every probe plus integration/live-fire.
6. Supply GHCR and exact Fly app access; dispatch the release workflow, record four signed digests, and pass staging HTTPS probes.
7. Complete manual accessibility, security, capacity, incident, managed restore and compatible rollback drills; archive evidence.
8. Run `sh scripts/production-readiness-check.sh`; proceed only on the literal `production readiness: ok` sentinel.
9. Create the blueprint-authorized release tag only after scheduler/node completion, explicitly authorize the manual production deploy, monitor for 24 hours, and retain the prior compatible signed digest.
