=== FILE: PREFLIGHT.md ===
# PREFLIGHT

This is the only interactive checkpoint. No graph node may begin until `sh scripts/preflight.sh` prints `preflight: ok`.

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
=== END FILE ===

=== FILE: .env.example ===
# Copy to .env. Never commit .env.
DATABASE_URL=postgresql://legacy_app:replace@db.example.invalid:5432/legacy_vault
TEST_DATABASE_URL=postgresql://legacy_test:replace@localhost:5432/legacy_vault_test
REDIS_URL=rediss://default:replace@redis.example.invalid:6379
DEEPSEEK_API_KEY=replace_with_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
R2_ACCOUNT_ID=replace_account_id
R2_ACCESS_KEY_ID=replace_access_key
R2_SECRET_ACCESS_KEY=replace_secret_key
R2_BUCKET=legacy-vault-production
R2_ENDPOINT=https://replace.r2.cloudflarestorage.com
STRIPE_SECRET_KEY=sk_test_replace
STRIPE_WEBHOOK_SECRET=whsec_replace
STRIPE_PRICE_ESSENTIAL=price_replace
RESEND_API_KEY=re_replace
EMAIL_FROM=Legacy Vault <notices@example.invalid>
TURNSTILE_SITE_KEY=replace_site_key
TURNSTILE_SECRET_KEY=replace_secret_key
SENTRY_DSN=
FLY_API_TOKEN=replace_fly_token
FLY_APP_STAGING=legacy-vault-staging
FLY_APP_PRODUCTION=legacy-vault-production
GHCR_TOKEN=replace_ghcr_token
GHCR_OWNER=replace_owner
APP_ENCRYPTION_KEK=base64_32_byte_or_stronger_key
SESSION_SECRET=base64_32_byte_or_stronger_secret
AUDIT_HMAC_KEY=base64_32_byte_or_stronger_key
EXPORT_SIGNING_KEY=base64_ed25519_private_key
APP_BASE_URL=https://app.example.invalid
API_BASE_URL=https://api.example.invalid
SECURITY_CONTACT=security@example.invalid
PRIVACY_CONTACT=privacy@example.invalid
LEGAL_ENTITY_NAME=Legacy Vault Concierge LLC
LEGAL_ENTITY_ADDRESS=replace_with_registered_business_address
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_EXPORTER_OTLP_HEADERS=
=== END FILE ===

=== FILE: .agent/MANIFEST.md ===
# Manifest

- `.agent/EXECUTION_RULES.md` - blueprint or execution artifact - L1
- `.agent/GRAPH.md` - blueprint or execution artifact - L1
- `.agent/LOOPS.md` - blueprint or execution artifact - L1
- `.agent/MANIFEST.md` - blueprint or execution artifact - L2
- `.agent/PLANS.md` - blueprint or execution artifact - L2
- `.agent/adapters/RECIPE.md` - blueprint or execution artifact - L2
- `.agent/checklists/agent-readiness.md` - blueprint or execution artifact - L5
- `.agent/checklists/final-review.md` - blueprint or execution artifact - L5
- `.agent/checklists/implementation.md` - blueprint or execution artifact - L5
- `.agent/checklists/incident-response.md` - blueprint or execution artifact - L5
- `.agent/checklists/preflight.md` - blueprint or execution artifact - L5
- `.agent/checklists/production-readiness.md` - blueprint or execution artifact - L5
- `.agent/checklists/release.md` - blueprint or execution artifact - L5
- `.agent/checklists/rollback.md` - blueprint or execution artifact - L5
- `.agent/checklists/validation.md` - blueprint or execution artifact - L5
- `.agent/execplans/EP-000-discovery-and-toolchain.md` - blueprint or execution artifact - L4
- `.agent/execplans/EP-001-foundation.md` - blueprint or execution artifact - L4
- `.agent/execplans/EP-002-core-domain.md` - blueprint or execution artifact - L4
- `.agent/execplans/EP-003-data-and-persistence.md` - blueprint or execution artifact - L4
- `.agent/execplans/EP-004-api-or-service-layer.md` - blueprint or execution artifact - L4
- `.agent/execplans/EP-005-user-interface-or-client.md` - blueprint or execution artifact - L4
- `.agent/execplans/EP-006-auth-security-and-permissions.md` - blueprint or execution artifact - L4
- `.agent/execplans/EP-007-testing-hardening.md` - blueprint or execution artifact - L4
- `.agent/execplans/EP-008-observability-and-operations.md` - blueprint or execution artifact - L4
- `.agent/execplans/EP-009-deployment-and-release.md` - blueprint or execution artifact - L4
- `.agent/execplans/EP-010-production-readiness-and-ship.md` - blueprint or execution artifact - L4
- `.agent/prompts/continue-execplan.md` - blueprint or execution artifact - L4
- `.agent/prompts/debug-validation-failure.md` - blueprint or execution artifact - L4
- `.agent/prompts/execute-active-execplan.md` - blueprint or execution artifact - L4
- `.agent/prompts/final-review.md` - blueprint or execution artifact - L4
- `.agent/prompts/run-graph.md` - blueprint or execution artifact - L4
- `.agent/reality-allow` - blueprint or execution artifact - L2
- `.agent/reality-patterns` - blueprint or execution artifact - L2
- `.agent/specs/SPEC-000-product-scope.md` - blueprint or execution artifact - L2
- `.agent/specs/SPEC-001-core-domain.md` - blueprint or execution artifact - L2
- `.agent/specs/SPEC-002-data-model.md` - blueprint or execution artifact - L2
- `.agent/specs/SPEC-003-api-contracts.md` - blueprint or execution artifact - L2
- `.agent/specs/SPEC-004-ui-ux-behavior.md` - blueprint or execution artifact - L2
- `.agent/specs/SPEC-005-auth-and-permissions.md` - blueprint or execution artifact - L2
- `.agent/specs/SPEC-006-error-handling.md` - blueprint or execution artifact - L2
- `.agent/specs/SPEC-007-observability.md` - blueprint or execution artifact - L2
- `.agent/specs/SPEC-008-production-readiness.md` - blueprint or execution artifact - L2
- `.agent/state/LEDGER.md` - blueprint or execution artifact - L6
- `.agent/templates/adr-template.md` - blueprint or execution artifact - L4
- `.agent/templates/execplan-template.md` - blueprint or execution artifact - L4
- `.agent/templates/runbook-template.md` - blueprint or execution artifact - L4
- `.agent/templates/spec-template.md` - blueprint or execution artifact - L4
- `.agent/templates/test-case-template.md` - blueprint or execution artifact - L4
- `.env.example` - blueprint or execution artifact - L2
- `.gitignore` - blueprint or execution artifact - L2
- `AGENTS.md` - blueprint or execution artifact - L1
- `AI_PROCESSING_NOTICE.md` - blueprint or execution artifact - L2
- `ARCHITECTURE.md` - blueprint or execution artifact - L2
- `ASSUMPTIONS.md` - blueprint or execution artifact - L2
- `BLUEPRINT_INPUT.md` - blueprint or execution artifact - L2
- `CLAUDE.md` - blueprint or execution artifact - L1
- `COMMANDS.md` - blueprint or execution artifact - L4
- `CONTRIBUTING.md` - blueprint or execution artifact - L4
- `DATA_RETENTION_SCHEDULE.md` - blueprint or execution artifact - L2
- `DECISIONS.md` - blueprint or execution artifact - L2
- `DEPLOYMENT.md` - blueprint or execution artifact - L2
- `DPIA.md` - blueprint or execution artifact - L2
- `ENVIRONMENT.md` - blueprint or execution artifact - L2
- `HERMES.md` - blueprint or execution artifact - L1
- `HOW_TO_USE.md` - blueprint or execution artifact - L2
- `OBSERVABILITY.md` - blueprint or execution artifact - L2
- `OPENCLAW.md` - blueprint or execution artifact - L1
- `OPERATIONS.md` - blueprint or execution artifact - L2
- `PREFLIGHT.md` - blueprint or execution artifact - L2
- `PRIVACY_POLICY_DRAFT.md` - blueprint or execution artifact - L2
- `PRODUCTION_READINESS.md` - blueprint or execution artifact - L2
- `PROJECT_BRIEF.md` - blueprint or execution artifact - L2
- `RELEASE.md` - blueprint or execution artifact - L2
- `ROADMAP.md` - blueprint or execution artifact - L2
- `ROLLBACK.md` - blueprint or execution artifact - L2
- `SECURITY.md` - blueprint or execution artifact - L2
- `SUBPROCESSOR_REGISTER.md` - blueprint or execution artifact - L2
- `TERMS_OF_SERVICE_DRAFT.md` - blueprint or execution artifact - L2
- `TESTING.md` - blueprint or execution artifact - L2
- `scripts/build.sh` - blueprint or execution artifact - L5
- `scripts/dependency-audit.sh` - blueprint or execution artifact - L5
- `scripts/format-check.sh` - blueprint or execution artifact - L5
- `scripts/graph-next.sh` - blueprint or execution artifact - L5
- `scripts/install.sh` - blueprint or execution artifact - L5
- `scripts/ledger.sh` - blueprint or execution artifact - L5
- `scripts/lint.sh` - blueprint or execution artifact - L5
- `scripts/live-fire.sh` - blueprint or execution artifact - L5
- `scripts/preflight.sh` - blueprint or execution artifact - L5
- `scripts/probes/database_url.sh` - blueprint or execution artifact - L5
- `scripts/probes/deepseek_api_key.sh` - blueprint or execution artifact - L5
- `scripts/probes/fly.sh` - blueprint or execution artifact - L5
- `scripts/probes/github.sh` - blueprint or execution artifact - L5
- `scripts/probes/otel.sh` - blueprint or execution artifact - L5
- `scripts/probes/r2.sh` - blueprint or execution artifact - L5
- `scripts/probes/redis_url.sh` - blueprint or execution artifact - L5
- `scripts/probes/resend.sh` - blueprint or execution artifact - L5
- `scripts/probes/sentry.sh` - blueprint or execution artifact - L5
- `scripts/probes/stripe.sh` - blueprint or execution artifact - L5
- `scripts/probes/turnstile.sh` - blueprint or execution artifact - L5
- `scripts/probes/twilio.sh` - blueprint or execution artifact - L5
- `scripts/production-readiness-check.sh` - blueprint or execution artifact - L5
- `scripts/reality-gate.sh` - blueprint or execution artifact - L5
- `scripts/security-check.sh` - blueprint or execution artifact - L5
- `scripts/smoke-test.sh` - blueprint or execution artifact - L5
- `scripts/test-e2e.sh` - blueprint or execution artifact - L5
- `scripts/test-integration.sh` - blueprint or execution artifact - L5
- `scripts/test-unit.sh` - blueprint or execution artifact - L5
- `scripts/typecheck.sh` - blueprint or execution artifact - L5
- `scripts/verify.sh` - blueprint or execution artifact - L5

TOTAL FILES: 109
=== END FILE ===

=== FILE: BLUEPRINT_INPUT.md ===
# 6LAYER Filled Input: Legacy Vault Concierge

## Project Name
Legacy Vault Concierge

## Project Description
A privacy-first multi-tenant SaaS for adults, retirees, households, family helpers, and professional partners to securely collect, classify, verify, maintain, and export the non-secret information and documents needed during incapacity, death, disaster, or household transition. The system creates a secure digital vault, life inventory, emergency packet, executor preparation binder, beneficiary review checklist, document gap report, household continuity guide, and annual review workflow. It uses DeepSeek V4 Flash through a strictly isolated AI Policy Gateway for bounded interpretation tasks. Structured verified records, not model output, are authoritative.

## Product Goal
Deliver a trusted, low-cost, highly automated household continuity platform that can support at least 1,000 household profiles on the launch architecture, maintain strong privacy and security controls, achieve at least 97 percent cache hits on cache-eligible repeated prefix tokens, minimize externally processed personal data, and generate evidence-linked outputs without offering legal, medical, tax, or financial advice.

## Target Users
Primary account holders age 55 and older; spouses and partners; adult children and family helpers; executors and successor trustees preparing for future duties; financial advisers, estate-planning attorneys, insurance professionals, funeral homes, senior-living organizations, and care coordinators using delegated or partner workspaces.

## Core User Outcomes
1. Create a household and complete a guided life-information inventory.
2. Upload a real document, classify it, redact prohibited data, extract evidence-linked facts, and confirm or reject each fact.
3. Create and maintain financial, insurance, property, adviser, dependent, pet, medical-summary, digital-asset-location, and household-instruction records without storing prohibited secrets.
4. Generate a versioned family emergency guide from confirmed facts only.
5. Generate a versioned executor preparation packet with clear unconfirmed and missing-information labels.
6. Invite a family helper with category-limited permissions and revoke that access.
7. Request, approve, deny, delay, and audit compartmentalized emergency access.
8. Export household data and documents in encrypted, portable form.
9. Delete an account through a verifiable deletion workflow, including downstream processor deletion requests when contractually available.
10. Complete an annual review that detects stale facts, expiring documents, contradictions, and missing categories.
11. Use the AI interview while preventing prohibited data from being transmitted to DeepSeek.
12. Observe measured DeepSeek cache-hit, cache-miss, latency, redaction, and cost telemetry without logging sensitive content.
13. Purchase and manage a subscription through Stripe test and production environments.
14. Exercise privacy rights through an authenticated request workflow and receive a machine-readable audit trail.

## Existing Repository Status
Greenfield.

## Preferred Tech Stack
Frontend: Next.js 16, React, TypeScript, Tailwind CSS, Radix UI, React Hook Form, Zod, Playwright.
Backend: TypeScript modular monolith using Fastify with OpenAPI and background workers using BullMQ.
Database: PostgreSQL 17 with pgvector, Drizzle ORM, row-level security, application-level envelope encryption.
Authentication: Better Auth with passkeys, TOTP MFA, Argon2id password fallback, secure server-side sessions, device and recovery management.
Hosting / Deployment: Cloudflare DNS, CDN, WAF, Turnstile, and R2; containerized API and worker on Fly.io; managed PostgreSQL on Neon; Upstash Redis; GitHub Actions.
Testing: Vitest, Testcontainers, Playwright, axe-core, k6, Schemathesis-compatible OpenAPI checks, POSIX shell gates.
Package Manager: pnpm 10 pinned through Corepack.
CI/CD: GitHub Actions with immutable lockfile install, migration checks, full verify, image build, staging deployment, production manual approval.
Observability: OpenTelemetry, Sentry, structured JSON logs with Pino, Prometheus-compatible metrics, Better Uptime or equivalent external checks.

## External Services, APIs, and Credentials Already Known
DeepSeek Open Platform API; Neon PostgreSQL; Upstash Redis; Cloudflare R2, Turnstile, DNS, and WAF; Stripe Billing; Resend transactional email; Twilio optional SMS; Sentry; GitHub Actions and GitHub Container Registry; Fly.io; optional VirusTotal is prohibited for customer files; ClamAV is local; local OCR is PaddleOCR or OCRmyPDF.

## Agent Platforms Expected To Run This Pack
Claude Code, Codex CLI, Hermes, OpenClaw, and any terminal agent able to read, edit, and execute repository commands.

## Auto-Deploy Authorization
No. The run ends at a proven, tagged, ship-ready artifact and emits one exact manual production deployment command.

## Business Constraints
Startup infrastructure must remain lean; target core infrastructure below 900 USD monthly at 1,000 profiles under ordinary usage; concierge-assisted onboarding launches before pure self-service; no sale of personal information; no advertising business model; no data brokerage; no dark patterns; no mandatory long-term contract for consumers; payment processing delegated to Stripe; support access is just-in-time and audited.

## Technical Constraints
Modular monolith first; no production GPU; DeepSeek calls only through the AI Policy Gateway; provider abstraction mandatory; stable canonical prompt prefixes; versioned household capsules; deterministic processing before LLM use; object storage separate from compute; no production secret values in source or logs; all jobs idempotent; all schema changes migrate through expand-migrate-contract; support at least 1,000 profiles without redesign and make horizontal scaling straightforward.

## Security / Compliance Constraints
NIST-aligned risk management; OWASP ASVS Level 2 baseline; OWASP API Security Top 10; strong encryption; tenant isolation; least privilege; passkeys and MFA; immutable audit logging; customer-approved support access; secure software development lifecycle; vendor risk review; incident response; breach notification decision tree; cyber and technology E&O insurance before production; legal review before launch; no representation that the product is a law firm, fiduciary, financial adviser, tax adviser, medical provider, executor, or trustee.

## Performance Requirements
P95 authenticated API latency below 400 ms excluding asynchronous AI and document jobs; P95 dashboard page interactive below 3 seconds on a normal broadband connection; upload acknowledgement below 2 seconds before background processing; 1,000 profiles and 250 monthly active households on launch topology; 50 concurrent interview sessions; 10 concurrent document processing jobs; queue backpressure; at least 97 percent cache hits on cache-eligible repeated prefix tokens and at least 90 percent overall DeepSeek input-token cache-hit target after warming; Max Thinking under 3 percent of AI calls; no single prompt above configured task budget.

## Accessibility Requirements
WCAG 2.2 AA target; keyboard complete; semantic HTML; visible focus; 18 px default body text; 44 by 44 pixel minimum pointer targets; no color-only status; screen-reader labels; captions and transcript correction for voice; plain-language error messages; printable workflow; reduced-motion support.

## Data / Privacy Requirements
Data minimization by default; prohibit passwords, PINs, seed phrases, private keys, recovery codes, complete payment-card numbers, and complete Social Security numbers; exact secret-location references may be stored; explicit layered AI-processing notice and affirmative consent; DeepSeek processing off until enabled; user-visible list of categories sent to external AI; redaction and data-loss-prevention gateway; no training or secondary-use promise unless contractually verified; disclose international processing and vendor location accurately; configurable retention; confirmed deletion workflow; export and correction rights; subprocessor register; privacy request ledger; no sale or targeted advertising; no data broker activity; separate consent for sensitive data; document-level consent and delete-original option; privacy-policy and Terms version acceptance records; records of processing; DPIA before launch; state-law applicability matrix maintained by counsel.

## Integrations
DeepSeek API, Stripe Billing, Resend, optional Twilio, Cloudflare R2 and Turnstile, Neon, Upstash, Sentry, OpenTelemetry endpoint, Fly.io, GitHub, local ClamAV, local OCR, browser WebAuthn.

## Non-Goals
No drafting or execution of wills, trusts, powers of attorney, deeds, medical directives, or tax forms; no legal conclusions; no probate guarantee; no beneficiary recommendations; no medical treatment recommendations; no financial-account aggregation at launch; no password manager; no crypto custody; no automatic transfer of assets; no sale of customer data; no social network; no voice cloning; no biometric identification; no minors as account owners; no fully automatic emergency release based only on an uploaded document.

## Timeline / Milestones
Twelve-week revenue-first launch: weeks 1-2 foundation and threat model; weeks 3-4 core domain and persistence; weeks 5-6 API and interview; weeks 7-8 UI, document ingestion, and reports; weeks 9-10 auth, privacy, security, and billing; week 11 live-fire, accessibility, performance, and operations; week 12 counsel review, pilot, and ship readiness.

## Deployment Target
Staging and production Fly.io applications in a US region, Cloudflare edge, Neon US PostgreSQL, Cloudflare R2 with US jurisdiction where available, Upstash US Redis, GitHub Container Registry. Production deployment is manual after all gates and legal/vendor reviews pass.

## Runtime Budgets
Each milestone maximum six attempts; ordinary milestones 90 minutes; migrations, auth, document isolation, privacy deletion, emergency access, and live-fire milestones 180 minutes. DeepSeek gateway tasks enforce token, latency, and dollar ceilings by task family.

## Special Instructions
Privacy and Terms controls are product requirements, not paperwork. Produce a layered notice, full Privacy Policy, Terms of Service, AI Processing Notice, Subprocessor Register, Retention Schedule, Data Processing Addendum template, Privacy Impact Assessment, Incident Response Plan, and counsel review checklist. DeepSeek must remain optional, isolated, replaceable, and unable to receive prohibited secrets. Do not assert zero retention, no training, US-only processing, or a specific deletion period unless the current DeepSeek contract and policy have been verified and archived. Use a launch gate that blocks production if the vendor terms are incompatible with household vault data. Cache optimization must never override minimization, consent, purpose limitation, or deletion.
=== END FILE ===

=== FILE: AGENTS.md ===
# Legacy Vault 6LAYER Control Plane

## 1. Mission
Build and prove a privacy-first household continuity SaaS that organizes verified life information, protects sensitive records, isolates optional AI processing, and produces trustworthy emergency and executor-preparation outputs without crossing into legal, medical, tax, financial-advisory, fiduciary, or secret-custody functions.

## 2. THE BOOT SEQUENCE
PRIME-BLOCK-BEGIN
This repository is governed by a 6LAYER blueprint pack. AGENTS.md is the authoritative control plane; if anything here conflicts with AGENTS.md, AGENTS.md wins.
On every session start, execute THE BOOT SEQUENCE:
1. Read AGENTS.md fully. 2. Read COMMANDS.md. 3. Read .agent/GRAPH.md and .agent/LOOPS.md. 4. Run: sh scripts/ledger.sh tail 30. 5. Run: sh scripts/preflight.sh -- it MUST print "preflight: ok"; if it fails, report the exact missing items from PREFLIGHT.md and stop (this is the only legitimate pre-run stop). 6. Run: sh scripts/graph-next.sh and dispatch on its one-line output exactly as .agent/GRAPH.md specifies. 7. Repeat step 6 after every completed node until ALL_DONE, then run the ship gate in AGENTS.md.
Hard rules: do not ask the user questions; choose the smallest reversible option, record it, continue. Use only commands from COMMANDS.md. Never invent an API, route, table, flag, or env var -- verify in-repo or transcribe from the pack. One node at a time; milestones in order; commit after every milestone; append ledger events as .agent/LOOPS.md requires. Bounded retries per .agent/LOOPS.md -- never repeat a failed fix. No mocks, stubs, demo modes, or placeholder code in production paths; scripts/reality-gate.sh and scripts/live-fire.sh must genuinely pass. Never weaken a gate, skip a test, or claim an unrun result. Stop only at NODE_BLOCKED (with the full evidence report) or ALL_DONE.
PRIME-BLOCK-END

## 3. Source-of-truth hierarchy
Current explicit user instruction wins, followed by L1 control, L2 specification, L3 graph, L4 execution, repository code and tests, L5 gate output as observed fact, and L6 state as history. A lower layer may not contradict a higher layer.

## 4. Graph protocol
One node equals one ExecPlan. Only one node may hold a lease. Run `sh scripts/graph-next.sh` for every dispatch. A node is done only after all milestones pass, node verify emits its sentinel, expected files match, NODE_DONE is appended, and the green tag exists. Commit every milestone. Never cross a completed green tag during rollback.

## 5. STOP conditions
Stop only when: preflight fails before the run; an action would destroy user or production data or cause an irreversible external side effect not explicitly specified; a legal, financial, or security judgment is unanswered by the specs; NODE_BLOCKED follows the full bounded ladder with evidence; or production deploy is reached because auto-deploy is not authorized. Do not ask the user for next steps, preferences, or confirmation. Proceed.

## 6. Anti-drift
At each milestone read the milestone, its non-goals, and ledger tail. Change only listed paths. Revert unapproved paths. Do not perform broad refactors, dependency swaps, reorganizations, or unrelated cleanup.

## 7. Anti-hallucination
Never invent APIs, commands, variables, tables, routes, fields, flags, or provider promises. Transcribe supplied content or verify repository evidence. DeepSeek retention, training, location, and deletion representations require archived current evidence and counsel approval.

## 8. Anti-fixation
Use the bounded verify-fix ladder in `.agent/LOOPS.md`. Never repeat a failed fix. Isolate on the second identical signature, take the declared fallback on the third, rollback after fallback exhaustion, then block.

## 9. Reality law
Software that appears to work is a failure state. Only software proven by live-fire counts. Production paths contain no mocks, stubs, demo modes, sample data presented as real, skipped gates, or success without effect.

## 10. Dependencies
Prefer existing pinned dependencies. Add only when required by a spec. Pin exact versions, update the lockfile and documentation, run audits, and record the decision.

## 11. Files and commits
Create files exactly as plans prescribe. Commit after each milestone using `[EP-XXX][Mk] imperative summary`. Keep the worktree clean between milestones.

## 12. Testing
Follow TESTING.md. A gate may never be weakened to make code pass. Test doubles exist only in enumerated test zones; live-fire uses real dependencies.

## 13. Documentation edits
L1 is immutable during a run. L2 and L3 require evidence-backed spec update and decision entry. Only ExecPlan progress regions in L4 are mutable. L5 gates may not weaken. L6 ledger is append-only.

## 14. Security
Follow SECURITY.md. Never place customer secrets, raw sensitive payloads, access tokens, or unredacted LLM content in logs, tickets, analytics, traces, or model prompts.

## 15. Definition of done
A node requires milestones, verify sentinel, expected-files audit, NODE_DONE, and green tag. The run requires fresh verify, production readiness, release tag, manual deploy instruction, and RUN_COMPLETE.

## 16. Final response
Report nodes completed, expected versus changed files, commands and observed sentinels, acceptance criteria, decisions, assumption changes, remaining risks, and ship-gate status.
=== END FILE ===

=== FILE: CLAUDE.md ===
# Claude Code Adapter

PRIME-BLOCK-BEGIN
This repository is governed by a 6LAYER blueprint pack. AGENTS.md is the authoritative control plane; if anything here conflicts with AGENTS.md, AGENTS.md wins.
On every session start, execute THE BOOT SEQUENCE:
1. Read AGENTS.md fully. 2. Read COMMANDS.md. 3. Read .agent/GRAPH.md and .agent/LOOPS.md. 4. Run: sh scripts/ledger.sh tail 30. 5. Run: sh scripts/preflight.sh -- it MUST print "preflight: ok"; if it fails, report the exact missing items from PREFLIGHT.md and stop (this is the only legitimate pre-run stop). 6. Run: sh scripts/graph-next.sh and dispatch on its one-line output exactly as .agent/GRAPH.md specifies. 7. Repeat step 6 after every completed node until ALL_DONE, then run the ship gate in AGENTS.md.
Hard rules: do not ask the user questions; choose the smallest reversible option, record it, continue. Use only commands from COMMANDS.md. Never invent an API, route, table, flag, or env var -- verify in-repo or transcribe from the pack. One node at a time; milestones in order; commit after every milestone; append ledger events as .agent/LOOPS.md requires. Bounded retries per .agent/LOOPS.md -- never repeat a failed fix. No mocks, stubs, demo modes, or placeholder code in production paths; scripts/reality-gate.sh and scripts/live-fire.sh must genuinely pass. Never weaken a gate, skip a test, or claim an unrun result. Stop only at NODE_BLOCKED (with the full evidence report) or ALL_DONE.
PRIME-BLOCK-END
=== END FILE ===

=== FILE: HERMES.md ===
# Hermes Adapter

PRIME-BLOCK-BEGIN
This repository is governed by a 6LAYER blueprint pack. AGENTS.md is the authoritative control plane; if anything here conflicts with AGENTS.md, AGENTS.md wins.
On every session start, execute THE BOOT SEQUENCE:
1. Read AGENTS.md fully. 2. Read COMMANDS.md. 3. Read .agent/GRAPH.md and .agent/LOOPS.md. 4. Run: sh scripts/ledger.sh tail 30. 5. Run: sh scripts/preflight.sh -- it MUST print "preflight: ok"; if it fails, report the exact missing items from PREFLIGHT.md and stop (this is the only legitimate pre-run stop). 6. Run: sh scripts/graph-next.sh and dispatch on its one-line output exactly as .agent/GRAPH.md specifies. 7. Repeat step 6 after every completed node until ALL_DONE, then run the ship gate in AGENTS.md.
Hard rules: do not ask the user questions; choose the smallest reversible option, record it, continue. Use only commands from COMMANDS.md. Never invent an API, route, table, flag, or env var -- verify in-repo or transcribe from the pack. One node at a time; milestones in order; commit after every milestone; append ledger events as .agent/LOOPS.md requires. Bounded retries per .agent/LOOPS.md -- never repeat a failed fix. No mocks, stubs, demo modes, or placeholder code in production paths; scripts/reality-gate.sh and scripts/live-fire.sh must genuinely pass. Never weaken a gate, skip a test, or claim an unrun result. Stop only at NODE_BLOCKED (with the full evidence report) or ALL_DONE.
PRIME-BLOCK-END
=== END FILE ===

=== FILE: OPENCLAW.md ===
# OpenClaw Adapter

PRIME-BLOCK-BEGIN
This repository is governed by a 6LAYER blueprint pack. AGENTS.md is the authoritative control plane; if anything here conflicts with AGENTS.md, AGENTS.md wins.
On every session start, execute THE BOOT SEQUENCE:
1. Read AGENTS.md fully. 2. Read COMMANDS.md. 3. Read .agent/GRAPH.md and .agent/LOOPS.md. 4. Run: sh scripts/ledger.sh tail 30. 5. Run: sh scripts/preflight.sh -- it MUST print "preflight: ok"; if it fails, report the exact missing items from PREFLIGHT.md and stop (this is the only legitimate pre-run stop). 6. Run: sh scripts/graph-next.sh and dispatch on its one-line output exactly as .agent/GRAPH.md specifies. 7. Repeat step 6 after every completed node until ALL_DONE, then run the ship gate in AGENTS.md.
Hard rules: do not ask the user questions; choose the smallest reversible option, record it, continue. Use only commands from COMMANDS.md. Never invent an API, route, table, flag, or env var -- verify in-repo or transcribe from the pack. One node at a time; milestones in order; commit after every milestone; append ledger events as .agent/LOOPS.md requires. Bounded retries per .agent/LOOPS.md -- never repeat a failed fix. No mocks, stubs, demo modes, or placeholder code in production paths; scripts/reality-gate.sh and scripts/live-fire.sh must genuinely pass. Never weaken a gate, skip a test, or claim an unrun result. Stop only at NODE_BLOCKED (with the full evidence report) or ALL_DONE.
PRIME-BLOCK-END
=== END FILE ===

=== FILE: .agent/adapters/RECIPE.md ===
# Adapter Recipe
1. Find the platform's standing-instruction file.
2. Place this block there byte-for-byte and add only one platform-name line outside it.

PRIME-BLOCK-BEGIN
This repository is governed by a 6LAYER blueprint pack. AGENTS.md is the authoritative control plane; if anything here conflicts with AGENTS.md, AGENTS.md wins.
On every session start, execute THE BOOT SEQUENCE:
1. Read AGENTS.md fully. 2. Read COMMANDS.md. 3. Read .agent/GRAPH.md and .agent/LOOPS.md. 4. Run: sh scripts/ledger.sh tail 30. 5. Run: sh scripts/preflight.sh -- it MUST print "preflight: ok"; if it fails, report the exact missing items from PREFLIGHT.md and stop (this is the only legitimate pre-run stop). 6. Run: sh scripts/graph-next.sh and dispatch on its one-line output exactly as .agent/GRAPH.md specifies. 7. Repeat step 6 after every completed node until ALL_DONE, then run the ship gate in AGENTS.md.
Hard rules: do not ask the user questions; choose the smallest reversible option, record it, continue. Use only commands from COMMANDS.md. Never invent an API, route, table, flag, or env var -- verify in-repo or transcribe from the pack. One node at a time; milestones in order; commit after every milestone; append ledger events as .agent/LOOPS.md requires. Bounded retries per .agent/LOOPS.md -- never repeat a failed fix. No mocks, stubs, demo modes, or placeholder code in production paths; scripts/reality-gate.sh and scripts/live-fire.sh must genuinely pass. Never weaken a gate, skip a test, or claim an unrun result. Stop only at NODE_BLOCKED (with the full evidence report) or ALL_DONE.
PRIME-BLOCK-END
=== END FILE ===

=== FILE: .agent/GRAPH.md ===
# Execution Graph

One node is one bounded ExecPlan. The ledger determines state. At most one LEASE may be live. Commit every milestone and create `green/EP-XXX` only after the node verify sentinel and expected-files audit pass.

GRAPH-TABLE-BEGIN
NODE EP-000 DEPS -
NODE EP-001 DEPS EP-000
NODE EP-002 DEPS EP-001
NODE EP-003 DEPS EP-002
NODE EP-004 DEPS EP-003
NODE EP-005 DEPS EP-004
NODE EP-006 DEPS EP-004
NODE EP-007 DEPS EP-005,EP-006
NODE EP-008 DEPS EP-007
NODE EP-009 DEPS EP-008
NODE EP-010 DEPS EP-009
GRAPH-TABLE-END

Dispatch: NEXT leases and executes. RESUME continues an open lease or takes over only after 90 minutes of inactivity. BLOCKED halts. STALL becomes GRAPH_STALL and halts. ALL_DONE runs the ship gate.

The arc moves from evidence and toolchain through foundation, domain, persistence, service, client and security branches, hardening, operations, deployment, and final ship proof.
=== END FILE ===

=== FILE: .agent/LOOPS.md ===
# Bounded Execution Loops

## Run loop
Run `sh scripts/graph-next.sh`, dispatch exactly, and repeat until BLOCKED or ALL_DONE. Node count is finite.

## Node loop
Lease one node, execute milestones in order, verify, audit expected files, append NODE_DONE, create the green tag, and release.

## Milestone ladder
Maximum six total attempts unless the plan declares another cap. Normalize the first error line as a signature and append SIG. First same-signature failure: one hypothesis and smallest fix. Second: isolate with a narrower diagnostic before editing. Third: take the declared real fallback. If fallback exhausts three attempts or total cap is reached: rollback to the last checkpoint and attempt fallback once from clean state. Final failure: append NODE_BLOCKED with command output, exit codes, signatures, hypotheses, diffs, smallest human decision, and recommended default.

The same fix may never be applied twice. A new signature resets the rung but not the total cap.

## Readiness
Probe background services at most 30 times with two-second sleeps, record PID or container ID, and define teardown. Exhaustion becomes READINESS_TIMEOUT_<service>.

## Watchdogs
Identical command and output three times forces a rung climb. Ten actions without a ledger append require HEARTBEAT. After every milestone inspect git status and changed paths; revert paths outside CHANGE unless a prior decision permits them. Exceeding a milestone budget becomes BUDGET_EXCEEDED and enters rung three.

## Re-grounding
At every milestone read its block, node non-goals, and `sh scripts/ledger.sh tail 15`.

## Non-interactive mandate
Export `CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive`. Editors, pagers, foreground watch modes, credential prompts, and destructive interactive commands are forbidden.
=== END FILE ===

=== FILE: .agent/state/LEDGER.md ===
2026-08-05T17:13:10Z | forge | - | RUN_INIT | pack generated
=== END FILE ===

=== FILE: scripts/ledger.sh ===
#!/usr/bin/env sh
# 6LAYER ledger helper. Append-only event writer + status reader.
# The ledger is the single source of runtime truth. Details must not contain " | ".
# Usage:
#   sh scripts/ledger.sh append <AGENT_ID> <NODE|-> <EVENT> [detail...]
#   sh scripts/ledger.sh status <NODE>     -> DONE | BLOCKED | IN_PROGRESS | PENDING
#   sh scripts/ledger.sh tail [n]
set -eu
LEDGER=".agent/state/LEDGER.md"
[ -f "$LEDGER" ] || { echo "ledger.sh: missing $LEDGER (repo not bootstrapped)" >&2; exit 1; }
cmd="${1:-}"
[ -n "$cmd" ] && shift
case "$cmd" in
  append)
    agent="${1:?agent id}"; node="${2:?node id or -}"; event="${3:?event}"; shift 3
    detail="${*:-}"
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    printf '%s | %s | %s | %s | %s\n' "$ts" "$agent" "$node" "$event" "$detail" >> "$LEDGER"
    ;;
  status)
    node="${1:?node id}"
    line=$(grep -E "\| $node \| (NODE_DONE|NODE_BLOCKED|LEASE_RELEASE|LEASE) \|" "$LEDGER" | tail -n 1)
    case "$line" in
      *"| NODE_DONE |"*)     echo DONE ;;
      *"| NODE_BLOCKED |"*)  echo BLOCKED ;;
      *"| LEASE_RELEASE |"*) echo PENDING ;;
      *"| LEASE |"*)         echo IN_PROGRESS ;;
      *)                     echo PENDING ;;
    esac
    ;;
  tail)
    n="${1:-30}"
    tail -n "$n" "$LEDGER"
    ;;
  *)
    echo "usage: ledger.sh append|status|tail ..." >&2
    exit 2
    ;;
esac
=== END FILE ===

=== FILE: scripts/graph-next.sh ===
#!/usr/bin/env sh
# 6LAYER deterministic scheduler. Reads GRAPH-TABLE and the ledger.
# Prints exactly one line:
#   NEXT <id>    first PENDING node whose deps are all DONE
#   RESUME <id>  a node holds an unreleased lease
#   BLOCKED <id> a node is terminally blocked
#   STALL <id>   no eligible node but work remains (graph defect; treat as BLOCKED)
#   ALL_DONE     every node is DONE
set -eu
GRAPH=".agent/GRAPH.md"
[ -f "$GRAPH" ] || { echo "graph-next.sh: missing $GRAPH" >&2; exit 1; }
tmp=$(mktemp)
trap 'rm -f "$tmp" "$tmp.status"' EXIT
awk '
  /^GRAPH-TABLE-BEGIN$/ { t=1; next }
  /^GRAPH-TABLE-END$/   { t=0 }
  t && $1=="NODE"       { print $2, $4 }
' "$GRAPH" > "$tmp"
[ -s "$tmp" ] || { echo "graph-next.sh: GRAPH-TABLE empty or missing" >&2; exit 1; }
: > "$tmp.status"
while read -r id deps; do
  st=$(sh scripts/ledger.sh status "$id")
  printf '%s %s %s\n' "$id" "$st" "$deps" >> "$tmp.status"
done < "$tmp"
blocked=$(awk '$2=="BLOCKED"{print $1; exit}' "$tmp.status")
if [ -n "$blocked" ]; then echo "BLOCKED $blocked"; exit 0; fi
resume=$(awk '$2=="IN_PROGRESS"{print $1; exit}' "$tmp.status")
if [ -n "$resume" ]; then echo "RESUME $resume"; exit 0; fi
next=$(awk '
  { st[$1]=$2; ord[NR]=$1; dep[$1]=$3; n=NR }
  END {
    for (i=1; i<=n; i++) {
      id=ord[i]
      if (st[id]=="PENDING") {
        ok=1
        m=split(dep[id], a, ",")
        for (j=1; j<=m; j++) { d=a[j]; if (d!="-" && st[d]!="DONE") { ok=0; break } }
        if (ok) { print id; exit }
      }
    }
  }
' "$tmp.status")
if [ -n "$next" ]; then
  echo "NEXT $next"
else
  undone=$(awk '$2!="DONE"{print $1; exit}' "$tmp.status")
  if [ -z "$undone" ]; then echo "ALL_DONE"; else echo "STALL $undone"; fi
fi
=== END FILE ===

=== FILE: PROJECT_BRIEF.md ===
# Legacy Vault Concierge Project Brief

Legacy Vault solves the operational problem of families not knowing what exists, where it is, whether it is current, or who is authorized to act. It organizes evidence-linked, user-confirmed facts and creates compartmentalized continuity packets. The fourteen core outcomes in BLUEPRINT_INPUT.md are the live-fire ship criteria.

Business goals: launch a high-margin concierge-assisted subscription, retain households through annual review, and grow through trusted professional partners. Technical goals: trustworthy structured records, low operating cost, horizontal scalability, measurable AI spend, and provider replaceability.

Out of scope includes legal instruments, advice, fiduciary services, custody, account aggregation, password storage, voice cloning, minors as owners, and sale of personal information. Production readiness is defined only by PRODUCTION_READINESS.md and the ship gate.
=== END FILE ===

=== FILE: ASSUMPTIONS.md ===
# Assumptions

| Assumption | Reason | Risk if wrong | Verification | Blocks implementation |
|---|---|---|---|---|
| Legal entity is a US LLC | Business details were not supplied | Terms and notices could identify the wrong controller | Open `.env` and counsel approval evidence | Yes for production |
| DeepSeek V4 Flash remains API-accessible | Requested model | Model name, terms, or features may change | Run API probe and archive current docs | Yes for AI production |
| DeepSeek contract does not provide an assumed zero-retention promise | No verified enterprise contract supplied | Sending vault data may create unacceptable transfer or retention risk | Review signed terms and vendor assessment | Yes for sensitive AI use |
| US hosting regions are available from selected vendors | Preferred architecture | Cross-border or regional mismatch | Provider console evidence | Yes for production |
| Product launches only in the United States | No international launch requested | International law may apply | Counsel-approved launch matrix | Yes for non-US launch |
| Users are at least 18 | Minors are a non-goal | COPPA and capacity risk | Age gate tests | No |
| Auto-deploy is not authorized | Input says no | Production side effects | DEPLOYMENT.md | No |
| Concierge staff may handle customer records only with approved JIT access | Business model needs assistance | Insider-risk exposure | Security tests and support-access audit | Yes |
=== END FILE ===

=== FILE: ARCHITECTURE.md ===
# Architecture

## System
A Next.js web application calls a Fastify modular monolith. PostgreSQL stores authoritative structured facts, consent versions, access control, and audit metadata. R2 stores client-side or server-side envelope-encrypted objects. BullMQ workers perform OCR, classification, report generation, deletion, notifications, and annual reviews. One AI Policy Gateway is the only code allowed to call DeepSeek.

## Repository map
`apps/web`, `apps/api`, `apps/worker`, `apps/report-renderer`, `packages/domain`, `packages/database`, `packages/auth`, `packages/crypto`, `packages/ai-gateway`, `packages/documents`, `packages/reports`, `packages/audit`, `packages/contracts`, `packages/ui`, `compliance`, `infra`, and `tests`.

## Code import law
1. `packages/domain` imports no application, database, framework, network, or vendor package.
2. `packages/contracts` may import domain types but no infrastructure.
3. `packages/database`, `auth`, `crypto`, `documents`, `reports`, `audit`, and `ai-gateway` may import domain and contracts.
4. Applications may import packages. Packages may not import applications.
5. Only `packages/ai-gateway` may import the DeepSeek adapter.
6. Only `packages/database` defines tables or migrations.
7. Only `packages/crypto` accesses raw key material.

## Authoritative fact flow
Upload or interview input becomes a candidate fact with source, evidence, confidence, and sensitivity. It is never authoritative until user-confirmed or professionally verified. Reports query confirmed facts and render missing or disputed items visibly.

## AI boundary
The gateway classifies task and data, checks affirmative consent, rejects prohibited content, applies deterministic redaction, builds a stable canonical prefix, invokes a provider adapter, validates JSON schema and evidence spans, records token/cache telemetry without payload, and returns candidate facts. Provider output never writes authoritative facts directly.

## Cache design
Prompt order is immutable global policy, task family policy, schema, stable reference, versioned safe household capsule, stable document text where permitted, then volatile request. Canonical JSON uses sorted keys and normalized whitespace. Application exact-result cache runs before provider calls. Cache metrics separate total hit ratio from eligible-prefix ratio. Cache padding, irrelevant context, and minimization violations are forbidden.

## Data and security boundaries
A per-household data-encryption key is wrapped by a KMS-managed key. Sensitive columns receive application-level encryption. Objects are encrypted and addressed by random identifiers. RLS and service authorization both enforce tenant isolation. Support access is customer-approved, time-limited, reason-coded, and audited.

## Privacy architecture
Consent is purpose-specific and versioned. AI processing is disabled until the user sees the provider and transfer notice and opts in. Users can process manually instead. Deletion is a state machine with legal-hold exceptions, processor requests, tombstone minimization, evidence, and completion notice. Privacy policy promises must be testable controls.

## Scale
At 1,000 profiles the modular monolith uses two API replicas, scalable workers, managed PostgreSQL, Redis, and object storage. Queue depth and DB connections drive horizontal scaling. Audit tables partition by month at higher volume. Provider and storage adapters permit migration.

## Invariants
INV-001: no prohibited secret reaches an external model.
INV-002: no unconfirmed AI fact appears as confirmed.
INV-003: every report claim links to fact and evidence status.
INV-004: every object access checks household and category permission.
INV-005: every consequential action creates a tamper-evident audit event.
INV-006: deletion and export are idempotent, resumable workflows.
INV-007: cache optimization never overrides minimization, consent, or deletion.
INV-008: DeepSeek is replaceable and may be disabled without loss of core records.
INV-009: legal, medical, tax, and financial-advice boundaries are enforced in UI and output.
INV-010: production configuration fails closed.

## Forbidden moves
No direct model calls, secrets in model prompts, raw payload logs, bypass of confirmation, cross-tenant joins without explicit tenant predicates, public object URLs, irreversible migration in one release, hidden AI consent, broad emergency access, or provider-specific domain types.
=== END FILE ===

=== FILE: ROADMAP.md ===
# Roadmap

Do not implement from this file. Implementation happens only through the graph: run sh scripts/graph-next.sh.

EP-000 proves toolchain and external readiness. EP-001 creates the pinned foundation. EP-002 implements domain invariants. EP-003 adds encrypted persistence and migrations. EP-004 exposes validated services and workflows. EP-005 implements accessible user outcomes. EP-006 implements authentication, authorization, privacy, and security. EP-007 hardens tests and live-fire. EP-008 adds observable operations. EP-009 proves staging, release, and rollback. EP-010 executes the complete ship standard.
=== END FILE ===

=== FILE: DECISIONS.md ===
# Decisions

| ID | Decision | Rationale | Status |
|---|---|---|---|
| ADR-001 | Modular monolith before microservices | Lowest cost and operational burden | Accepted |
| ADR-002 | Structured verified facts are authoritative | Prevents model hallucination from becoming record truth | Accepted |
| ADR-003 | DeepSeek only through an isolated gateway | Centralizes privacy, policy, cache, and replacement | Accepted |
| ADR-004 | DeepSeek AI is optional per household | Consent and vendor-risk control | Accepted |
| ADR-005 | Do not collect vault secrets at launch | Reduces catastrophic exposure | Accepted |
| ADR-006 | Manual production deployment | User did not authorize automatic deploy | Accepted |
| ADR-007 | Concierge-assisted launch | Produces revenue and workflow evidence earlier | Accepted |
| ADR-008 | US-only launch until counsel expands scope | Limits legal surface | Accepted |

Add a decision before introducing a new canonical name, dependency, provider promise, data category, or exception. Use `.agent/templates/adr-template.md`.
=== END FILE ===

=== FILE: SECURITY.md ===
# Security and Privacy Security Standard

## Goals
Preserve confidentiality, integrity, availability, tenant isolation, authenticity of audit history, purpose limitation, and user control for highly sensitive household information.

## Threat summary
Primary threats are account takeover, malicious family or support access, cross-tenant access, document malware, prompt injection, model-vendor disclosure, log leakage, insecure exports, emergency-access abuse, deletion failure, insider misuse, and misleading legal or privacy representations.

## Authentication and authorization
Passkeys are preferred. TOTP MFA is required for owners and staff. Password fallback uses Argon2id. Sessions are server-side, rotated after privilege changes, short-lived for staff, and revocable. Every API action evaluates organization, household, category, record, role, consent, and purpose. Database RLS is defense in depth, not the only control.

## AI data-loss prevention
The gateway blocks passwords, PINs, recovery codes, seed phrases, private keys, complete SSNs, full payment cards, authentication answers, exact safe combinations, and unapproved identity documents. It records only finding type, count, and action. Documents are untrusted instructions. Prompt injection is ignored and flagged.

## DeepSeek conditions
Production AI processing is blocked unless current DeepSeek terms, privacy policy, retention behavior, training/secondary-use status, subprocessors, security posture, transfer locations, deletion mechanism, incident terms, and contract priority have been reviewed and archived. Marketing and policy text must not promise zero retention or no training unless the signed contract supports it. The provider receives minimized content only after affirmative user consent.

## Upload security
Direct signed uploads, independent MIME detection, file-size and page limits, local ClamAV scan, decompression-bomb controls, image normalization, no executable rendering, random object keys, and quarantine before processing.

## Cryptography
TLS in transit. Per-household DEKs and KMS-wrapped KEKs. AES-256-GCM or an approved authenticated-encryption primitive. Ed25519 signatures for portable export manifests. Key versions are stored; keys are rotated without re-encrypting everything at once.

## Logging
Never log payloads, documents, extracted facts, credentials, tokens, cookies, complete identifiers, model prompts, model outputs, signed URLs, or encryption material. Structured logs include request ID, tenant pseudonym, actor pseudonym, action, result, duration, policy decision, and error class.

## Dependency policy
Critical and high exploitable vulnerabilities block shipment. Waivers require an ADR with affected version, exploitability, compensating control, owner, expiration, and replacement date.

## Migrations
Use expand, migrate, contract. Destructive operations require verified backup, restore proof, dual-read or compatibility period, and rollback plan.

## STOP conditions
Stop before destructive production data action, irreversible external side effect, or unanswered legal, financial, privacy, or security judgment.
=== END FILE ===

=== FILE: PRIVACY_POLICY_DRAFT.md ===
# Legacy Vault Privacy Policy Draft

Status: counsel review required before publication. This draft is a product-control specification and must be reconciled with actual production behavior, contracts, locations, and legal entity details.

## Scope and controller
This policy describes how the legal entity identified in the published notice handles personal information through Legacy Vault. Partner organizations may act as separate controllers for information they independently collect. The published policy must identify the actual legal entity, address, privacy email, effective date, and prior-version archive.

## Information collected
Account and authentication data; household and relationship data; adviser and emergency-contact data; document and record metadata; user-provided household, financial-category, insurance, property, medical-summary, funeral-preference, digital-asset-location, and continuity information; communications; consent and privacy-request records; subscription metadata from Stripe; security, device, audit, and diagnostic data. Legacy Vault does not intend to collect passwords, PINs, seed phrases, private keys, recovery codes, full card numbers, complete SSNs, or exact safe combinations. The product must warn and block these categories.

## Sources
Users, authorized household collaborators, partner organizations acting under their own authority, user-uploaded documents, service providers, and automatically collected security telemetry. Legacy Vault does not buy household dossiers from data brokers.

## Purposes
Provide the vault and reports; verify and organize records; process documents and optional AI interviews; authenticate users; enforce permissions; provide emergency-access workflows; deliver notices; process subscriptions; prevent abuse and fraud; debug and secure the service; comply with law; and exercise or defend legal rights. No unrelated purpose may be added without updating controls and notice.

## AI processing
DeepSeek or a replacement provider may process minimized excerpts only when the household has enabled external AI processing and the task requires it. Before consent, the product identifies the provider, categories, purpose, likely processing locations, known retention and secondary-use terms, and manual alternative. The application applies redaction and does not intentionally send prohibited secrets. AI results are suggestions until confirmed. Users may disable future AI processing without losing confirmed structured records.

## Disclosure and subprocessors
Information may be disclosed to infrastructure, storage, database, cache, email, billing, security, observability, deployment, and AI subprocessors strictly for service provision and under applicable contracts. The current subprocessor list, purposes, processing locations, and change-notice mechanism must be linked. Information may also be disclosed for legal process, safety, fraud prevention, business transactions subject to notice and protections, or at the user's direction.

## No sale or targeted advertising
Legacy Vault does not sell personal information, share it for cross-context behavioral advertising, or use vault content for targeted advertising. The business must not operate as a data broker. If practices change, the change requires legal review, advance notice, and all applicable opt-out mechanisms.

## Retention
Retention is category-specific and published in a retention schedule. Active account data is retained while needed to provide the service. Candidate extraction data and temporary files receive short operational periods. Security logs, billing records, consent records, legal records, backups, and deletion evidence have separate periods. Deletion from backups occurs through bounded expiration rather than unsafe selective backup editing. The notice must state actual approved periods, not vague indefinite language.

## User choices and rights
Authenticated access, correction, export, deletion, collaborator management, AI enable or disable, marketing preference, and consent withdrawal. Jurisdiction-specific rights may include confirmation, access, correction, deletion, portability, appeal, limitation, and opt-out. Identity verification must be proportionate and may not require more data than the original request warrants.

## Emergency access
The owner defines recipients and categories. Requests create alerts and a delay. Legacy Vault does not independently determine legal incapacity, death, executor status, or entitlement. Release is compartmentalized and audited. Users must keep designations current.

## Security
Administrative, technical, and organizational safeguards include encryption, MFA, passkeys, least privilege, tenant isolation, upload scanning, audit logging, staff access controls, monitoring, incident response, and vendor reviews. No system is perfectly secure; the policy must not overpromise.

## International processing
The published policy must identify actual processing countries and safeguards. DeepSeek processing may involve countries different from the user's location. AI remains disabled when the company cannot provide an accurate, acceptable disclosure or lawful transfer basis.

## Children
The service is not for users under 18 and is not directed to children under 13.

## Changes
Material changes receive advance notice where required. Consent is not silently expanded. Policy versions and acceptance events are retained.

## Contact and appeals
Publish privacy and security contacts, request channel, response timing, appeal process, and regulator complaint rights applicable to the user.
=== END FILE ===

=== FILE: TERMS_OF_SERVICE_DRAFT.md ===
# Legacy Vault Terms of Service Draft

Status: counsel review required. The production Terms must match the deployed product, pricing, dispute law, entity, and insurance.

## Service
Legacy Vault provides organizational software, document processing, optional AI assistance, reminders, collaboration, and versioned informational packets. It is not a law firm, lawyer, fiduciary, executor, trustee, tax adviser, financial adviser, insurer, healthcare provider, emergency service, or password manager.

## Eligibility and accounts
Users must be at least 18, provide accurate account information, protect authentication factors, and notify Legacy Vault of suspected compromise. The account owner is responsible for invitations and category permissions.

## Authorized content
Users represent that they have authority to upload and process information about themselves and invited or represented persons. Users may not upload unlawful material, malware, stolen credentials, passwords, seed phrases, private keys, recovery codes, full card data, or information they lack authority to process.

## AI terms
AI features are optional and may be inaccurate. The service uses a disclosed external provider only after consent and gateway controls. AI output is informational and must be reviewed. It does not create legal instruments, determine capacity, interpret rights conclusively, recommend beneficiaries, or replace a qualified professional. Provider availability and model behavior may change. Legacy Vault may disable a provider when terms or security become unacceptable.

## User verification duty
Users must review extracted facts, recipients, permissions, contact information, packet contents, and review dates. An unconfirmed item is not represented as verified. Users are responsible for professional advice and legally effective documents.

## Emergency access
Emergency access is a communication and controlled-release workflow, not a legal determination. Delay, denial, verifier, and recipient settings are user-controlled subject to abuse safeguards. Legacy Vault may pause a release when fraud, dispute, compromise, or unclear authority is detected. It does not guarantee delivery, recipient identity, or legal entitlement.

## Fees and cancellation
Pricing, renewals, taxes, trial terms, refunds, and cancellation appear at checkout. Cancellation stops future renewal but does not erase records; deletion is a separate privacy action. Stripe processes payment information.

## Availability and changes
Maintenance, security events, provider outages, and force majeure may affect service. Material reductions receive notice where practical. No uptime guarantee exists unless a signed enterprise agreement states one.

## Intellectual property
Users retain rights in their content. They grant Legacy Vault a limited license to host, secure, process, transmit to disclosed subprocessors, and generate requested outputs solely to provide and protect the service. Legacy Vault owns the software, templates, branding, and aggregated de-identified operational metrics that cannot reasonably identify a household.

## Privacy
The Privacy Policy and AI Processing Notice explain data handling. Conflicts concerning personal-information handling are resolved in favor of the more protective specific commitment unless law requires otherwise.

## Security and prohibited conduct
No scraping, credential attacks, unauthorized access, interference, reverse engineering beyond non-waivable rights, use to harm or impersonate, or attempt to use the service as a credential vault. Security research follows the published disclosure policy.

## Disclaimers
The service is provided as available. Generated packets may be incomplete, stale, or unsuitable for a particular legal or personal situation. Users must consult qualified professionals. Disclaimers may not waive rights that law makes non-waivable.

## Liability allocation
Counsel must set a conspicuous, enforceable liability cap, exclusions, carve-outs, and jurisdictional exceptions. The final clause must consider confidentiality breaches, gross negligence, willful misconduct, infringement, payment obligations, indemnity, and statutory rights. Do not use an arbitrary copied cap without counsel.

## Indemnity
Counsel must tailor indemnity to unauthorized content, unlawful use, and violation of third-party rights, with control-of-defense and notice procedures.

## Disputes
Counsel must determine governing law, venue, arbitration, class waiver, small-claims option, opt-out procedure, and consumer-law exceptions. The product must record acceptance and make the terms downloadable before acceptance.

## Termination and data
Legacy Vault may suspend for security or legal risk using the least restrictive action. Users can export before ordinary termination. Deletion follows the retention schedule, legal holds, and backup expiration. Core consent and transaction evidence may be retained where legally required.
=== END FILE ===

=== FILE: AI_PROCESSING_NOTICE.md ===
# AI Processing Notice

Before any content is sent to DeepSeek, show a concise first layer and a linked detailed layer.

## First layer
Legacy Vault can use DeepSeek to help classify documents, suggest extracted facts, summarize confirmed information, and phrase interview questions. This may send minimized and redacted content to DeepSeek for processing. Do not enter passwords, PINs, recovery codes, seed phrases, private keys, complete Social Security numbers, complete payment-card numbers, or safe combinations. AI can be wrong. Nothing becomes a confirmed vault fact until you approve it. External AI is optional; you can continue manually.

Buttons: `Enable DeepSeek processing` and `Continue without external AI`. No pre-checked box.

## Detailed layer
Identify the current provider legal entity, current policy links, processing purpose, exact data categories, likely countries, contractually verified retention and secondary-use terms, security summary, subprocessors if available, withdrawal behavior, deletion limitations, and contact route. If any item is unknown, label it unknown rather than infer it. Production enablement is blocked until legal and vendor review approve this text.
=== END FILE ===

=== FILE: DATA_RETENTION_SCHEDULE.md ===
# Data Retention Schedule

Status: counsel and security approval required. Configure periods centrally and publish the approved values.

| Category | Proposed active period | Proposed post-account period | Deletion mechanism |
|---|---:|---:|---|
| Confirmed household facts | Account lifetime | 30-day recovery, then delete | Workflow deletion |
| Original documents | User choice, account lifetime maximum | 30-day recovery | Object tombstone then hard delete |
| OCR and temporary page images | 24 hours after successful extraction | None | Worker purge |
| Candidate facts | 30 days after resolution | None | Database purge |
| AI request metadata without payload | 13 months | 30 days | Partition expiry |
| AI prompts and outputs in Legacy Vault | Do not persist by default; encrypted 24-hour troubleshooting opt-in only | None | TTL purge |
| Audit events | 7 years where justified | 7 years | Append archive then expiry |
| Consent and policy acceptance | 7 years after relationship | 7 years | Legal record expiry |
| Billing records | Tax and accounting period set by counsel | Same | Provider and internal deletion |
| Security logs | 90 days hot, 12 months archive | Same | Partition expiry |
| Backups | 35-day rolling | 35 days | Automatic expiry |
| Privacy request evidence | 5 years | 5 years | Legal record expiry |

Legal holds suspend only affected categories. Deletion completion must distinguish active systems, processors, and backup expiry dates.
=== END FILE ===

=== FILE: SUBPROCESSOR_REGISTER.md ===
# Subprocessor Register

Status: verify contracts, legal entities, and locations before publication.

| Provider | Purpose | Data categories | Proposed region | Transfer risk | Required contract control |
|---|---|---|---|---|---|
| DeepSeek | Optional AI inference | Minimized redacted excerpts and safe capsules | Verify | High until verified | DPA, retention, secondary use, deletion, security, incident, transfer terms |
| Neon | PostgreSQL | Account, structured records, audit metadata | US | Medium | DPA, encryption, backup, deletion, incident |
| Cloudflare | Edge, Turnstile, R2 | Network metadata and encrypted objects | US preference | Medium | DPA, region controls, government request policy |
| Upstash | Queue and cache | Job metadata, no document content | US | Medium | DPA, TLS, retention |
| Stripe | Billing | Customer and transaction metadata | Provider controlled | Medium | Stripe DPA and consumer notice |
| Resend | Transactional email | Email address and message content | Verify | Medium | DPA, retention, suppression controls |
| Sentry | Errors | Redacted diagnostics only | US preference | Medium | Scrubbing and DPA |
| Fly.io | Compute | Transient application processing | US | Medium | DPA, region pinning, security |
| GitHub | CI and registry | Source and build artifacts, no production customer data | Provider controlled | Low | Private repo and secret controls |
| Twilio | Optional SMS | Phone and alert text | Verify | Medium | DPA and minimal messages |
=== END FILE ===

=== FILE: DPIA.md ===
# Data Protection Impact Assessment

## Processing
Legacy Vault centralizes sensitive household, financial-category, medical-summary, relationship, property, and end-of-life preference information. It processes documents and may transmit minimized content to an external AI provider after opt-in.

## Necessity and proportionality
Each collected field maps to a named continuity outcome. Prohibited secrets are blocked. External AI is optional. Deterministic extraction and manual entry reduce external disclosure. Category-level permissions and compartmentalized packets limit access.

## High risks
Account takeover; family coercion; insider access; cross-tenant failure; mistaken emergency release; model-vendor retention or transfer; prompt injection; inaccurate extraction; legal-advice confusion; deletion gaps; breach aggregation harm.

## Controls
Passkeys and MFA; JIT support access; per-household encryption; RLS; immutable audit; delayed and limited emergency release; evidence-linked confirmation; AI DLP gateway; vendor gate; no raw prompt logging; export signatures; tested deletion; annual stale-data review; plain-language disclaimers; incident response.

## Residual risk decisions
Production requires counsel, security, and executive sign-off. DeepSeek remains disabled if contract and transfer risk are not acceptable. Secret storage remains excluded. Emergency release requires a staged pilot and fraud review.
=== END FILE ===

=== FILE: TESTING.md ===
# Testing

Unit tests cover domain rules. Integration tests use real PostgreSQL, Redis, object storage emulator only when protocol-compatible, and actual provider sandboxes. E2E uses the real web and API entry points. Test doubles are legal only in `tests/unit/doubles` and never in live-fire. Every core outcome maps to a named E2E and live-fire proof. Flaky tests are bugs and cannot be retried until green. Accessibility uses axe and keyboard flows. Performance uses k6. Security includes tenant isolation, IDOR, upload, prompt injection, DLP, consent, deletion, and emergency-access abuse.
=== END FILE ===

=== FILE: ENVIRONMENT.md ===
# Environment

Node.js 24.4.1, pnpm 10.13.1, Docker 28.3.2, PostgreSQL client 17, git 2.45 or newer, curl, jq, openssl, awk, sed, grep, and POSIX sh. `.env` is validated at startup. Local, test, staging, and production use the same behavior with different credentials. Production refuses insecure cookies, missing encryption keys, AI without vendor approval evidence, public buckets, and wildcard CORS.
=== END FILE ===

=== FILE: DEPLOYMENT.md ===
# Deployment

Build one immutable OCI image per app and worker. GitHub Actions runs verify, builds and signs images, deploys staging, runs smoke and live-fire, and prepares production. Production is MANUAL: `fly deploy --app "$FLY_APP_PRODUCTION" --image "ghcr.io/$GHCR_OWNER/legacy-vault:$RELEASE_TAG" --strategy rolling`. Run migrations with a release command before traffic only when backward compatible. Rollback uses the prior signed image and compatible schema.
=== END FILE ===

=== FILE: OPERATIONS.md ===
# Operations

Health endpoints are `/health/live`, `/health/ready`, and `/health/dependencies`. Operators monitor queue depth, DB pool, R2 failures, AI error and cache ratios, consent failures, DLP blocks, report latency, privacy request age, deletion backlog, emergency requests, and auth anomalies. Backups run daily and restore is proven quarterly. Incidents follow `.agent/checklists/incident-response.md`.
=== END FILE ===

=== FILE: OBSERVABILITY.md ===
# Observability

Pino JSON logs include timestamp, level, service, environment, request_id, trace_id, tenant_pseudonym, actor_pseudonym, action, outcome, duration_ms, policy_decision, and error_class. Payloads are forbidden. Metrics include HTTP, queue, DB, object, auth, AI token/cache/cost, DLP, deletion, export, report, and emergency-access signals. Alerts page on tenant isolation, repeated export failure, deletion SLA breach, auth attack, audit-chain failure, and backup failure.
=== END FILE ===

=== FILE: PRODUCTION_READINESS.md ===
# Production Readiness

All fourteen outcomes pass live-fire. One fresh `scripts/verify.sh` emits every sentinel. Reality, security, privacy, performance, accessibility, observability, deployment, restore, rollback, legal review, vendor review, insurance, and incident contacts pass. DeepSeek claims match archived current evidence. Privacy and Terms match actual code. The release tag exists and production deploy remains manual.
=== END FILE ===

=== FILE: RELEASE.md ===
# Release

Use semantic versions. Release candidates require clean verify, staging deployment, migration rehearsal, restore proof, rollback drill, legal and privacy artifact hashes, and zero critical open defects. Production approval is manual because auto-deploy is not authorized. Monitor for 24 hours after release.
=== END FILE ===

=== FILE: ROLLBACK.md ===
# Rollback

Rollback triggers include elevated error rate, tenant boundary issue, corrupted output, audit failure, deletion failure, AI data-policy breach, or material privacy mismatch. Disable affected feature first, then roll back image. Database rollback uses forward-fix unless the migration has a proven reverse path. Verify health, smoke, audit continuity, and data integrity.
=== END FILE ===

=== FILE: CONTRIBUTING.md ===
# Contributing

Read AGENTS.md. Use feature branches, pinned dependencies, strict TypeScript, domain invariants in comments, tests for every behavior, and documentation updates. Commit format is `[EP-XXX][Mk] imperative summary`. Never introduce a provider promise without evidence or bypass the AI gateway.
=== END FILE ===

=== FILE: COMMANDS.md ===
# Commands

Export `CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive`. Legal commands are `sh scripts/install.sh`, `preflight.sh`, `lint.sh`, `format-check.sh`, `typecheck.sh`, `test-unit.sh`, `test-integration.sh`, `test-e2e.sh`, `build.sh`, `security-check.sh`, `dependency-audit.sh`, `smoke-test.sh`, `live-fire.sh`, `verify.sh`, and `production-readiness-check.sh`. Local start: `pnpm --filter @legacy/api start >.agent/state/api.log 2>&1 & echo $! >.agent/state/api.pid`; probe with curl and kill using the PID file. Adapter parity: `for f in AGENTS.md CLAUDE.md HERMES.md OPENCLAW.md; do awk '/PRIME-BLOCK-BEGIN/,/PRIME-BLOCK-END/' "$f" | cksum; done`. Coding agents must not invent commands. If a command is missing or stale, update this file first, citing repository evidence, with a Decision Log entry.
=== END FILE ===

=== FILE: .gitignore ===
.env
.env.*
!.env.example
node_modules/
.next/
dist/
coverage/
playwright-report/
test-results/
.agent/state/*.log
.agent/state/*.pid
*.local
.DS_Store
=== END FILE ===

=== FILE: .agent/reality-patterns ===
TODO|FIXME|XXX|HACK
todo!\(|unimplemented!\(|unreachable!\("not
NotImplementedError|raise NotImplemented
not implemented|Not implemented|NOT IMPLEMENTED
PLACEHOLDER|__REPLACE__|CHANGEME|changeme
\{\{[A-Z_]+\}\}
lorem ipsum|Lorem Ipsum
example\.com/api|sk-test-|xxxx-xxxx
=== END FILE ===

=== FILE: .agent/reality-allow ===
^__6L_ALLOW_NONE__$
=== END FILE ===

=== FILE: .agent/specs/SPEC-000-product-scope.md ===
# Spec 000 Product Scope

Product scope is the fourteen outcomes in BLUEPRINT_INPUT.md. Every feature must map to one outcome or an approved operational requirement. Non-goals are enforced, not aspirational.
=== END FILE ===

=== FILE: .agent/specs/SPEC-001-core-domain.md ===
# Spec 001 Core Domain

Canonical entities: Organization, Household, Person, Membership, Role, PermissionGrant, Contact, Adviser, Dependent, Pet, AssetRecord, LiabilityRecord, InsurancePolicy, PropertyRecord, EstateDocumentRecord, MedicalSummary, DigitalAssetLocation, HouseholdInstruction, FuneralPreference, CandidateFact, ConfirmedFact, Evidence, Contradiction, Document, Consent, PrivacyRequest, EmergencyAccessRequest, Report, Export, AuditEvent, Subscription, WorkflowRun.
=== END FILE ===

=== FILE: .agent/specs/SPEC-002-data-model.md ===
# Spec 002 Data Model

Every tenant table contains organization_id and household_id where applicable. Sensitive fields use encrypted envelopes. Facts include field_key, typed_value, status, source_type, source_id, confidence, sensitivity, confirmed_by, confirmed_at, last_reviewed_at, and version. Audit events form a hash chain. Deletion jobs track each system and processor.
=== END FILE ===

=== FILE: .agent/specs/SPEC-003-api-contracts.md ===
# Spec 003 Api Contracts

Routes use `/v1`. Canonical groups: auth, households, members, facts, documents, extractions, reports, exports, privacy-requests, emergency-access, consents, billing, audit-events, health, and ai-settings. All writes require idempotency key and optimistic version. Errors use RFC 9457 problem details.
=== END FILE ===

=== FILE: .agent/specs/SPEC-004-ui-ux-behavior.md ===
# Spec 004 Ui Ux Behavior

Dashboard shows one primary action, progress, missing categories, last review, and safety notices. Every AI surface displays enabled state and provider. Every extraction presents evidence, confidence, accept, edit, reject. Emergency access and deletion use review screens and step-up authentication. WCAG 2.2 AA is required.
=== END FILE ===

=== FILE: .agent/specs/SPEC-005-auth-and-permissions.md ===
# Spec 005 Auth And Permissions

Roles are Owner, CoOwner, Editor, FamilyHelper, ProfessionalAdvisor, ReadOnlyViewer, EmergencyRecipient, SupportAgent, PlatformAdmin. Permission grants can be category-scoped and time-bounded. Support and emergency access are never standing full-vault access.
=== END FILE ===

=== FILE: .agent/specs/SPEC-006-error-handling.md ===
# Spec 006 Error Handling

Errors are typed, safe, traceable, and retry-classified. Validation errors identify fields. Security denials reveal no existence. Async jobs are idempotent and expose status. Provider failures preserve user input and support manual continuation.
=== END FILE ===

=== FILE: .agent/specs/SPEC-007-observability.md ===
# Spec 007 Observability

Telemetry is content-free. AI metrics include task family, prompt version, model, mode, input tokens, cache hit, cache miss, output tokens, estimated cost, latency, DLP findings count, schema success, and retry count.
=== END FILE ===

=== FILE: .agent/specs/SPEC-008-production-readiness.md ===
# Spec 008 Production Readiness

Release requires fresh verify, live-fire, privacy-policy-to-code traceability, Terms acceptance tests, vendor evidence, restore, rollback, accessibility, performance, incident drill, subprocessor accuracy, and manual production command.
=== END FILE ===

=== FILE: .agent/PLANS.md ===
# ExecPlan Standard

An ExecPlan is self-contained. It contains machine header, purpose, scope, non-goals, context, files, contracts, milestones with GOAL READ CHANGE CONTENT RUN EXPECT EVIDENCE FALLBACK COMMIT, validation, recovery, progress, discoveries, decision log, and retrospective.
=== END FILE ===

=== FILE: .agent/EXECUTION_RULES.md ===
# Execution Rules

One active node. Boot every session. Use only COMMANDS.md. Re-ground every milestone. Evidence before edits and done. No hidden context, drift, broad refactor, repeated fix, mock production path, or gate weakening. Append ledger events and commit milestones. Stop only under AGENTS.md.
=== END FILE ===

=== FILE: .agent/prompts/run-graph.md ===
PRIME-BLOCK-BEGIN
This repository is governed by a 6LAYER blueprint pack. AGENTS.md is the authoritative control plane; if anything here conflicts with AGENTS.md, AGENTS.md wins.
On every session start, execute THE BOOT SEQUENCE:
1. Read AGENTS.md fully. 2. Read COMMANDS.md. 3. Read .agent/GRAPH.md and .agent/LOOPS.md. 4. Run: sh scripts/ledger.sh tail 30. 5. Run: sh scripts/preflight.sh -- it MUST print "preflight: ok"; if it fails, report the exact missing items from PREFLIGHT.md and stop (this is the only legitimate pre-run stop). 6. Run: sh scripts/graph-next.sh and dispatch on its one-line output exactly as .agent/GRAPH.md specifies. 7. Repeat step 6 after every completed node until ALL_DONE, then run the ship gate in AGENTS.md.
Hard rules: do not ask the user questions; choose the smallest reversible option, record it, continue. Use only commands from COMMANDS.md. Never invent an API, route, table, flag, or env var -- verify in-repo or transcribe from the pack. One node at a time; milestones in order; commit after every milestone; append ledger events as .agent/LOOPS.md requires. Bounded retries per .agent/LOOPS.md -- never repeat a failed fix. No mocks, stubs, demo modes, or placeholder code in production paths; scripts/reality-gate.sh and scripts/live-fire.sh must genuinely pass. Never weaken a gate, skip a test, or claim an unrun result. Stop only at NODE_BLOCKED (with the full evidence report) or ALL_DONE.
PRIME-BLOCK-END

Run the boot sequence now and continue dispatching until ALL_DONE or NODE_BLOCKED. Your session ends only at RUN_COMPLETE or a blocked report.
=== END FILE ===

=== FILE: .agent/prompts/execute-active-execplan.md ===
PRIME-BLOCK-BEGIN
This repository is governed by a 6LAYER blueprint pack. AGENTS.md is the authoritative control plane; if anything here conflicts with AGENTS.md, AGENTS.md wins.
On every session start, execute THE BOOT SEQUENCE:
1. Read AGENTS.md fully. 2. Read COMMANDS.md. 3. Read .agent/GRAPH.md and .agent/LOOPS.md. 4. Run: sh scripts/ledger.sh tail 30. 5. Run: sh scripts/preflight.sh -- it MUST print "preflight: ok"; if it fails, report the exact missing items from PREFLIGHT.md and stop (this is the only legitimate pre-run stop). 6. Run: sh scripts/graph-next.sh and dispatch on its one-line output exactly as .agent/GRAPH.md specifies. 7. Repeat step 6 after every completed node until ALL_DONE, then run the ship gate in AGENTS.md.
Hard rules: do not ask the user questions; choose the smallest reversible option, record it, continue. Use only commands from COMMANDS.md. Never invent an API, route, table, flag, or env var -- verify in-repo or transcribe from the pack. One node at a time; milestones in order; commit after every milestone; append ledger events as .agent/LOOPS.md requires. Bounded retries per .agent/LOOPS.md -- never repeat a failed fix. No mocks, stubs, demo modes, or placeholder code in production paths; scripts/reality-gate.sh and scripts/live-fire.sh must genuinely pass. Never weaken a gate, skip a test, or claim an unrun result. Stop only at NODE_BLOCKED (with the full evidence report) or ALL_DONE.
PRIME-BLOCK-END

Execute the named ExecPlan under all repository laws. Lease it, run milestones in order, verify, audit expected files, tag green, and report evidence.
=== END FILE ===

=== FILE: .agent/prompts/continue-execplan.md ===
PRIME-BLOCK-BEGIN
This repository is governed by a 6LAYER blueprint pack. AGENTS.md is the authoritative control plane; if anything here conflicts with AGENTS.md, AGENTS.md wins.
On every session start, execute THE BOOT SEQUENCE:
1. Read AGENTS.md fully. 2. Read COMMANDS.md. 3. Read .agent/GRAPH.md and .agent/LOOPS.md. 4. Run: sh scripts/ledger.sh tail 30. 5. Run: sh scripts/preflight.sh -- it MUST print "preflight: ok"; if it fails, report the exact missing items from PREFLIGHT.md and stop (this is the only legitimate pre-run stop). 6. Run: sh scripts/graph-next.sh and dispatch on its one-line output exactly as .agent/GRAPH.md specifies. 7. Repeat step 6 after every completed node until ALL_DONE, then run the ship gate in AGENTS.md.
Hard rules: do not ask the user questions; choose the smallest reversible option, record it, continue. Use only commands from COMMANDS.md. Never invent an API, route, table, flag, or env var -- verify in-repo or transcribe from the pack. One node at a time; milestones in order; commit after every milestone; append ledger events as .agent/LOOPS.md requires. Bounded retries per .agent/LOOPS.md -- never repeat a failed fix. No mocks, stubs, demo modes, or placeholder code in production paths; scripts/reality-gate.sh and scripts/live-fire.sh must genuinely pass. Never weaken a gate, skip a test, or claim an unrun result. Stop only at NODE_BLOCKED (with the full evidence report) or ALL_DONE.
PRIME-BLOCK-END

Read Progress, Surprises, Decision Log, and ledger tail. Resume at the first unchecked milestone after re-verifying the last checked milestone sentinel.
=== END FILE ===

=== FILE: .agent/prompts/debug-validation-failure.md ===
PRIME-BLOCK-BEGIN
This repository is governed by a 6LAYER blueprint pack. AGENTS.md is the authoritative control plane; if anything here conflicts with AGENTS.md, AGENTS.md wins.
On every session start, execute THE BOOT SEQUENCE:
1. Read AGENTS.md fully. 2. Read COMMANDS.md. 3. Read .agent/GRAPH.md and .agent/LOOPS.md. 4. Run: sh scripts/ledger.sh tail 30. 5. Run: sh scripts/preflight.sh -- it MUST print "preflight: ok"; if it fails, report the exact missing items from PREFLIGHT.md and stop (this is the only legitimate pre-run stop). 6. Run: sh scripts/graph-next.sh and dispatch on its one-line output exactly as .agent/GRAPH.md specifies. 7. Repeat step 6 after every completed node until ALL_DONE, then run the ship gate in AGENTS.md.
Hard rules: do not ask the user questions; choose the smallest reversible option, record it, continue. Use only commands from COMMANDS.md. Never invent an API, route, table, flag, or env var -- verify in-repo or transcribe from the pack. One node at a time; milestones in order; commit after every milestone; append ledger events as .agent/LOOPS.md requires. Bounded retries per .agent/LOOPS.md -- never repeat a failed fix. No mocks, stubs, demo modes, or placeholder code in production paths; scripts/reality-gate.sh and scripts/live-fire.sh must genuinely pass. Never weaken a gate, skip a test, or claim an unrun result. Stop only at NODE_BLOCKED (with the full evidence report) or ALL_DONE.
PRIME-BLOCK-END

Apply the bounded signature ladder to the failing command. Record evidence and never repeat a diff.
=== END FILE ===

=== FILE: .agent/prompts/final-review.md ===
PRIME-BLOCK-BEGIN
This repository is governed by a 6LAYER blueprint pack. AGENTS.md is the authoritative control plane; if anything here conflicts with AGENTS.md, AGENTS.md wins.
On every session start, execute THE BOOT SEQUENCE:
1. Read AGENTS.md fully. 2. Read COMMANDS.md. 3. Read .agent/GRAPH.md and .agent/LOOPS.md. 4. Run: sh scripts/ledger.sh tail 30. 5. Run: sh scripts/preflight.sh -- it MUST print "preflight: ok"; if it fails, report the exact missing items from PREFLIGHT.md and stop (this is the only legitimate pre-run stop). 6. Run: sh scripts/graph-next.sh and dispatch on its one-line output exactly as .agent/GRAPH.md specifies. 7. Repeat step 6 after every completed node until ALL_DONE, then run the ship gate in AGENTS.md.
Hard rules: do not ask the user questions; choose the smallest reversible option, record it, continue. Use only commands from COMMANDS.md. Never invent an API, route, table, flag, or env var -- verify in-repo or transcribe from the pack. One node at a time; milestones in order; commit after every milestone; append ledger events as .agent/LOOPS.md requires. Bounded retries per .agent/LOOPS.md -- never repeat a failed fix. No mocks, stubs, demo modes, or placeholder code in production paths; scripts/reality-gate.sh and scripts/live-fire.sh must genuinely pass. Never weaken a gate, skip a test, or claim an unrun result. Stop only at NODE_BLOCKED (with the full evidence report) or ALL_DONE.
PRIME-BLOCK-END

Run verify from scratch, reality gate, live-fire, expected-files audits, acceptance walk, privacy-to-code trace, and production readiness. Report every observed sentinel.
=== END FILE ===

=== FILE: .agent/execplans/EP-000-discovery-and-toolchain.md ===
NODE-META-BEGIN
ID: EP-000
DEPS: -
MAX_ATTEMPTS_PER_MILESTONE: 6
VERIFY: sh scripts/preflight.sh
VERIFY_SENTINEL: preflight: ok
GREEN_TAG: green/EP-000
NODE-META-END

# 1. Purpose / Big Picture
Prove tools, credentials, legal evidence, provider claims, and repository assumptions before implementation.

# 2. Scope
Only the capabilities named by this node and its linked specs.

# 3. Non-goals
No unrelated refactor, new provider, secret storage, legal advice, model promise, or production deployment.

# 4. Context and Orientation
Read AGENTS.md, ARCHITECTURE.md, SECURITY.md, BLUEPRINT_INPUT.md, and linked specs. Structured confirmed data is authoritative. DeepSeek remains isolated and optional.

# 5. Files to Read First
AGENTS.md; COMMANDS.md; .agent/GRAPH.md; .agent/LOOPS.md; ARCHITECTURE.md; SECURITY.md; BLUEPRINT_INPUT.md.

# 6. Expected Changed Files
- PREFLIGHT.md
- ASSUMPTIONS.md
- COMMANDS.md

# 7. Interfaces and Contracts
Use canonical vocabulary from SPEC-001, SPEC-002, and SPEC-003. No new names without a decision entry.

# 8. Milestones

### M1: Implement bounded scope
GOAL: Produce the node's real implementation and documentation with no production placeholders.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; linked specs.
CHANGE: PREFLIGHT.md, ASSUMPTIONS.md, COMMANDS.md.
CONTENT: Implement exact behavior required by the linked specs and invariants. For any repo-dependent file, inspect the pinned package API before composition and record evidence.
RUN: `sh scripts/install.sh`; `sh scripts/lint.sh`; `sh scripts/typecheck.sh`.
EXPECT: `install: ok`; `lint: ok`; `typecheck: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-000 MILESTONE_PASS "M1 install: ok lint: ok typecheck: ok"`.
FALLBACK: Reduce internal abstraction while preserving all named behavior and security boundaries.
COMMIT: `git add -A && git commit -m "[EP-000][M1] implement bounded scope"`.

### M2: Prove node behavior
GOAL: Prove the implementation through real tests and the node verify command.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; TESTING.md.
CHANGE: PREFLIGHT.md, ASSUMPTIONS.md, COMMANDS.md, tests.
CONTENT: Add real unit, integration, E2E, security, privacy, or live-fire proof required for this node; no mock of the behavior under test.
RUN: `sh scripts/preflight.sh`.
EXPECT: `preflight: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-000 MILESTONE_PASS "M2 preflight: ok"`.
FALLBACK: Isolate the failing capability and use the simplest real provider-compatible implementation allowed by the specs.
COMMIT: `git add -A && git commit -m "[EP-000][M2] prove node behavior"`.

# 9. Validation and Acceptance
The verify sentinel is observed in this session, changed paths match this plan, all expected files exist, no reality-gate hit exists, and privacy and security invariants remain true.

# 10. Idempotence and Recovery
Re-enter from the first unchecked milestone after verifying the previous checkpoint. Use green tags and the rollback ladder. Never cross a completed node tag.

# 11. Progress
- [ ] M1 Implement bounded scope
- [ ] M2 Prove node behavior

# 12. Surprises & Discoveries
- None recorded.

# 13. Decision Log
- None recorded.

# 14. Outcomes & Retrospective
- Complete only after NODE_DONE.
=== END FILE ===

=== FILE: .agent/execplans/EP-001-foundation.md ===
NODE-META-BEGIN
ID: EP-001
DEPS: EP-000
MAX_ATTEMPTS_PER_MILESTONE: 6
VERIFY: sh scripts/verify.sh
VERIFY_SENTINEL: verify: ok
GREEN_TAG: green/EP-001
NODE-META-END

# 1. Purpose / Big Picture
Create the pinned monorepo, configuration validation, CI baseline, and real test harness.

# 2. Scope
Only the capabilities named by this node and its linked specs.

# 3. Non-goals
No unrelated refactor, new provider, secret storage, legal advice, model promise, or production deployment.

# 4. Context and Orientation
Read AGENTS.md, ARCHITECTURE.md, SECURITY.md, BLUEPRINT_INPUT.md, and linked specs. Structured confirmed data is authoritative. DeepSeek remains isolated and optional.

# 5. Files to Read First
AGENTS.md; COMMANDS.md; .agent/GRAPH.md; .agent/LOOPS.md; ARCHITECTURE.md; SECURITY.md; BLUEPRINT_INPUT.md.

# 6. Expected Changed Files
- package.json
- pnpm-lock.yaml
- pnpm-workspace.yaml
- apps
- packages
- .github/workflows/verify.yml

# 7. Interfaces and Contracts
Use canonical vocabulary from SPEC-001, SPEC-002, and SPEC-003. No new names without a decision entry.

# 8. Milestones

### M1: Implement bounded scope
GOAL: Produce the node's real implementation and documentation with no production placeholders.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; linked specs.
CHANGE: package.json, pnpm-lock.yaml, pnpm-workspace.yaml, apps, packages, .github/workflows/verify.yml.
CONTENT: Implement exact behavior required by the linked specs and invariants. For any repo-dependent file, inspect the pinned package API before composition and record evidence.
RUN: `sh scripts/install.sh`; `sh scripts/lint.sh`; `sh scripts/typecheck.sh`.
EXPECT: `install: ok`; `lint: ok`; `typecheck: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-001 MILESTONE_PASS "M1 install: ok lint: ok typecheck: ok"`.
FALLBACK: Reduce internal abstraction while preserving all named behavior and security boundaries.
COMMIT: `git add -A && git commit -m "[EP-001][M1] implement bounded scope"`.

### M2: Prove node behavior
GOAL: Prove the implementation through real tests and the node verify command.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; TESTING.md.
CHANGE: package.json, pnpm-lock.yaml, pnpm-workspace.yaml, apps, packages, .github/workflows/verify.yml, tests.
CONTENT: Add real unit, integration, E2E, security, privacy, or live-fire proof required for this node; no mock of the behavior under test.
RUN: `sh scripts/verify.sh`.
EXPECT: `verify: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-001 MILESTONE_PASS "M2 verify: ok"`.
FALLBACK: Isolate the failing capability and use the simplest real provider-compatible implementation allowed by the specs.
COMMIT: `git add -A && git commit -m "[EP-001][M2] prove node behavior"`.

# 9. Validation and Acceptance
The verify sentinel is observed in this session, changed paths match this plan, all expected files exist, no reality-gate hit exists, and privacy and security invariants remain true.

# 10. Idempotence and Recovery
Re-enter from the first unchecked milestone after verifying the previous checkpoint. Use green tags and the rollback ladder. Never cross a completed node tag.

# 11. Progress
- [ ] M1 Implement bounded scope
- [ ] M2 Prove node behavior

# 12. Surprises & Discoveries
- None recorded.

# 13. Decision Log
- None recorded.

# 14. Outcomes & Retrospective
- Complete only after NODE_DONE.
=== END FILE ===

=== FILE: .agent/execplans/EP-002-core-domain.md ===
NODE-META-BEGIN
ID: EP-002
DEPS: EP-001
MAX_ATTEMPTS_PER_MILESTONE: 6
VERIFY: sh scripts/verify.sh
VERIFY_SENTINEL: verify: ok
GREEN_TAG: green/EP-002
NODE-META-END

# 1. Purpose / Big Picture
Implement entities, fact verification, permissions vocabulary, retention rules, and pure invariants.

# 2. Scope
Only the capabilities named by this node and its linked specs.

# 3. Non-goals
No unrelated refactor, new provider, secret storage, legal advice, model promise, or production deployment.

# 4. Context and Orientation
Read AGENTS.md, ARCHITECTURE.md, SECURITY.md, BLUEPRINT_INPUT.md, and linked specs. Structured confirmed data is authoritative. DeepSeek remains isolated and optional.

# 5. Files to Read First
AGENTS.md; COMMANDS.md; .agent/GRAPH.md; .agent/LOOPS.md; ARCHITECTURE.md; SECURITY.md; BLUEPRINT_INPUT.md.

# 6. Expected Changed Files
- packages/domain
- packages/contracts
- tests/unit

# 7. Interfaces and Contracts
Use canonical vocabulary from SPEC-001, SPEC-002, and SPEC-003. No new names without a decision entry.

# 8. Milestones

### M1: Implement bounded scope
GOAL: Produce the node's real implementation and documentation with no production placeholders.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; linked specs.
CHANGE: packages/domain, packages/contracts, tests/unit.
CONTENT: Implement exact behavior required by the linked specs and invariants. For any repo-dependent file, inspect the pinned package API before composition and record evidence.
RUN: `sh scripts/install.sh`; `sh scripts/lint.sh`; `sh scripts/typecheck.sh`.
EXPECT: `install: ok`; `lint: ok`; `typecheck: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-002 MILESTONE_PASS "M1 install: ok lint: ok typecheck: ok"`.
FALLBACK: Reduce internal abstraction while preserving all named behavior and security boundaries.
COMMIT: `git add -A && git commit -m "[EP-002][M1] implement bounded scope"`.

### M2: Prove node behavior
GOAL: Prove the implementation through real tests and the node verify command.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; TESTING.md.
CHANGE: packages/domain, packages/contracts, tests/unit, tests.
CONTENT: Add real unit, integration, E2E, security, privacy, or live-fire proof required for this node; no mock of the behavior under test.
RUN: `sh scripts/verify.sh`.
EXPECT: `verify: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-002 MILESTONE_PASS "M2 verify: ok"`.
FALLBACK: Isolate the failing capability and use the simplest real provider-compatible implementation allowed by the specs.
COMMIT: `git add -A && git commit -m "[EP-002][M2] prove node behavior"`.

# 9. Validation and Acceptance
The verify sentinel is observed in this session, changed paths match this plan, all expected files exist, no reality-gate hit exists, and privacy and security invariants remain true.

# 10. Idempotence and Recovery
Re-enter from the first unchecked milestone after verifying the previous checkpoint. Use green tags and the rollback ladder. Never cross a completed node tag.

# 11. Progress
- [ ] M1 Implement bounded scope
- [ ] M2 Prove node behavior

# 12. Surprises & Discoveries
- None recorded.

# 13. Decision Log
- None recorded.

# 14. Outcomes & Retrospective
- Complete only after NODE_DONE.
=== END FILE ===

=== FILE: .agent/execplans/EP-003-data-and-persistence.md ===
NODE-META-BEGIN
ID: EP-003
DEPS: EP-002
MAX_ATTEMPTS_PER_MILESTONE: 6
VERIFY: sh scripts/verify.sh
VERIFY_SENTINEL: verify: ok
GREEN_TAG: green/EP-003
NODE-META-END

# 1. Purpose / Big Picture
Implement encrypted PostgreSQL schema, RLS, migrations, object metadata, audit chain, and deletion state.

# 2. Scope
Only the capabilities named by this node and its linked specs.

# 3. Non-goals
No unrelated refactor, new provider, secret storage, legal advice, model promise, or production deployment.

# 4. Context and Orientation
Read AGENTS.md, ARCHITECTURE.md, SECURITY.md, BLUEPRINT_INPUT.md, and linked specs. Structured confirmed data is authoritative. DeepSeek remains isolated and optional.

# 5. Files to Read First
AGENTS.md; COMMANDS.md; .agent/GRAPH.md; .agent/LOOPS.md; ARCHITECTURE.md; SECURITY.md; BLUEPRINT_INPUT.md.

# 6. Expected Changed Files
- packages/database
- drizzle
- tests/integration

# 7. Interfaces and Contracts
Use canonical vocabulary from SPEC-001, SPEC-002, and SPEC-003. No new names without a decision entry.

# 8. Milestones

### M1: Implement bounded scope
GOAL: Produce the node's real implementation and documentation with no production placeholders.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; linked specs.
CHANGE: packages/database, drizzle, tests/integration.
CONTENT: Implement exact behavior required by the linked specs and invariants. For any repo-dependent file, inspect the pinned package API before composition and record evidence.
RUN: `sh scripts/install.sh`; `sh scripts/lint.sh`; `sh scripts/typecheck.sh`.
EXPECT: `install: ok`; `lint: ok`; `typecheck: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-003 MILESTONE_PASS "M1 install: ok lint: ok typecheck: ok"`.
FALLBACK: Reduce internal abstraction while preserving all named behavior and security boundaries.
COMMIT: `git add -A && git commit -m "[EP-003][M1] implement bounded scope"`.

### M2: Prove node behavior
GOAL: Prove the implementation through real tests and the node verify command.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; TESTING.md.
CHANGE: packages/database, drizzle, tests/integration, tests.
CONTENT: Add real unit, integration, E2E, security, privacy, or live-fire proof required for this node; no mock of the behavior under test.
RUN: `sh scripts/verify.sh`.
EXPECT: `verify: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-003 MILESTONE_PASS "M2 verify: ok"`.
FALLBACK: Isolate the failing capability and use the simplest real provider-compatible implementation allowed by the specs.
COMMIT: `git add -A && git commit -m "[EP-003][M2] prove node behavior"`.

# 9. Validation and Acceptance
The verify sentinel is observed in this session, changed paths match this plan, all expected files exist, no reality-gate hit exists, and privacy and security invariants remain true.

# 10. Idempotence and Recovery
Re-enter from the first unchecked milestone after verifying the previous checkpoint. Use green tags and the rollback ladder. Never cross a completed node tag.

# 11. Progress
- [ ] M1 Implement bounded scope
- [ ] M2 Prove node behavior

# 12. Surprises & Discoveries
- None recorded.

# 13. Decision Log
- None recorded.

# 14. Outcomes & Retrospective
- Complete only after NODE_DONE.
=== END FILE ===

=== FILE: .agent/execplans/EP-004-api-or-service-layer.md ===
NODE-META-BEGIN
ID: EP-004
DEPS: EP-003
MAX_ATTEMPTS_PER_MILESTONE: 6
VERIFY: sh scripts/verify.sh
VERIFY_SENTINEL: verify: ok
GREEN_TAG: green/EP-004
NODE-META-END

# 1. Purpose / Big Picture
Implement APIs, workflows, AI gateway, document pipeline, reports, billing, export, and privacy requests.

# 2. Scope
Only the capabilities named by this node and its linked specs.

# 3. Non-goals
No unrelated refactor, new provider, secret storage, legal advice, model promise, or production deployment.

# 4. Context and Orientation
Read AGENTS.md, ARCHITECTURE.md, SECURITY.md, BLUEPRINT_INPUT.md, and linked specs. Structured confirmed data is authoritative. DeepSeek remains isolated and optional.

# 5. Files to Read First
AGENTS.md; COMMANDS.md; .agent/GRAPH.md; .agent/LOOPS.md; ARCHITECTURE.md; SECURITY.md; BLUEPRINT_INPUT.md.

# 6. Expected Changed Files
- apps/api
- apps/worker
- packages/ai-gateway
- packages/documents
- packages/reports

# 7. Interfaces and Contracts
Use canonical vocabulary from SPEC-001, SPEC-002, and SPEC-003. No new names without a decision entry.

# 8. Milestones

### M1: Implement bounded scope
GOAL: Produce the node's real implementation and documentation with no production placeholders.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; linked specs.
CHANGE: apps/api, apps/worker, packages/ai-gateway, packages/documents, packages/reports.
CONTENT: Implement exact behavior required by the linked specs and invariants. For any repo-dependent file, inspect the pinned package API before composition and record evidence.
RUN: `sh scripts/install.sh`; `sh scripts/lint.sh`; `sh scripts/typecheck.sh`.
EXPECT: `install: ok`; `lint: ok`; `typecheck: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-004 MILESTONE_PASS "M1 install: ok lint: ok typecheck: ok"`.
FALLBACK: Reduce internal abstraction while preserving all named behavior and security boundaries.
COMMIT: `git add -A && git commit -m "[EP-004][M1] implement bounded scope"`.

### M2: Prove node behavior
GOAL: Prove the implementation through real tests and the node verify command.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; TESTING.md.
CHANGE: apps/api, apps/worker, packages/ai-gateway, packages/documents, packages/reports, tests.
CONTENT: Add real unit, integration, E2E, security, privacy, or live-fire proof required for this node; no mock of the behavior under test.
RUN: `sh scripts/verify.sh`.
EXPECT: `verify: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-004 MILESTONE_PASS "M2 verify: ok"`.
FALLBACK: Isolate the failing capability and use the simplest real provider-compatible implementation allowed by the specs.
COMMIT: `git add -A && git commit -m "[EP-004][M2] prove node behavior"`.

# 9. Validation and Acceptance
The verify sentinel is observed in this session, changed paths match this plan, all expected files exist, no reality-gate hit exists, and privacy and security invariants remain true.

# 10. Idempotence and Recovery
Re-enter from the first unchecked milestone after verifying the previous checkpoint. Use green tags and the rollback ladder. Never cross a completed node tag.

# 11. Progress
- [ ] M1 Implement bounded scope
- [ ] M2 Prove node behavior

# 12. Surprises & Discoveries
- None recorded.

# 13. Decision Log
- None recorded.

# 14. Outcomes & Retrospective
- Complete only after NODE_DONE.
=== END FILE ===

=== FILE: .agent/execplans/EP-005-user-interface-or-client.md ===
NODE-META-BEGIN
ID: EP-005
DEPS: EP-004
MAX_ATTEMPTS_PER_MILESTONE: 6
VERIFY: sh scripts/verify.sh
VERIFY_SENTINEL: verify: ok
GREEN_TAG: green/EP-005
NODE-META-END

# 1. Purpose / Big Picture
Implement accessible onboarding, vault, review, report, AI consent, privacy, and emergency-access flows.

# 2. Scope
Only the capabilities named by this node and its linked specs.

# 3. Non-goals
No unrelated refactor, new provider, secret storage, legal advice, model promise, or production deployment.

# 4. Context and Orientation
Read AGENTS.md, ARCHITECTURE.md, SECURITY.md, BLUEPRINT_INPUT.md, and linked specs. Structured confirmed data is authoritative. DeepSeek remains isolated and optional.

# 5. Files to Read First
AGENTS.md; COMMANDS.md; .agent/GRAPH.md; .agent/LOOPS.md; ARCHITECTURE.md; SECURITY.md; BLUEPRINT_INPUT.md.

# 6. Expected Changed Files
- apps/web
- tests/e2e

# 7. Interfaces and Contracts
Use canonical vocabulary from SPEC-001, SPEC-002, and SPEC-003. No new names without a decision entry.

# 8. Milestones

### M1: Implement bounded scope
GOAL: Produce the node's real implementation and documentation with no production placeholders.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; linked specs.
CHANGE: apps/web, tests/e2e.
CONTENT: Implement exact behavior required by the linked specs and invariants. For any repo-dependent file, inspect the pinned package API before composition and record evidence.
RUN: `sh scripts/install.sh`; `sh scripts/lint.sh`; `sh scripts/typecheck.sh`.
EXPECT: `install: ok`; `lint: ok`; `typecheck: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-005 MILESTONE_PASS "M1 install: ok lint: ok typecheck: ok"`.
FALLBACK: Reduce internal abstraction while preserving all named behavior and security boundaries.
COMMIT: `git add -A && git commit -m "[EP-005][M1] implement bounded scope"`.

### M2: Prove node behavior
GOAL: Prove the implementation through real tests and the node verify command.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; TESTING.md.
CHANGE: apps/web, tests/e2e, tests.
CONTENT: Add real unit, integration, E2E, security, privacy, or live-fire proof required for this node; no mock of the behavior under test.
RUN: `sh scripts/verify.sh`.
EXPECT: `verify: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-005 MILESTONE_PASS "M2 verify: ok"`.
FALLBACK: Isolate the failing capability and use the simplest real provider-compatible implementation allowed by the specs.
COMMIT: `git add -A && git commit -m "[EP-005][M2] prove node behavior"`.

# 9. Validation and Acceptance
The verify sentinel is observed in this session, changed paths match this plan, all expected files exist, no reality-gate hit exists, and privacy and security invariants remain true.

# 10. Idempotence and Recovery
Re-enter from the first unchecked milestone after verifying the previous checkpoint. Use green tags and the rollback ladder. Never cross a completed node tag.

# 11. Progress
- [ ] M1 Implement bounded scope
- [ ] M2 Prove node behavior

# 12. Surprises & Discoveries
- None recorded.

# 13. Decision Log
- None recorded.

# 14. Outcomes & Retrospective
- Complete only after NODE_DONE.
=== END FILE ===

=== FILE: .agent/execplans/EP-006-auth-security-and-permissions.md ===
NODE-META-BEGIN
ID: EP-006
DEPS: EP-004
MAX_ATTEMPTS_PER_MILESTONE: 6
VERIFY: sh scripts/verify.sh
VERIFY_SENTINEL: verify: ok
GREEN_TAG: green/EP-006
NODE-META-END

# 1. Purpose / Big Picture
Implement passkeys, MFA, sessions, authorization, JIT support, audit, abuse prevention, and privacy controls.

# 2. Scope
Only the capabilities named by this node and its linked specs.

# 3. Non-goals
No unrelated refactor, new provider, secret storage, legal advice, model promise, or production deployment.

# 4. Context and Orientation
Read AGENTS.md, ARCHITECTURE.md, SECURITY.md, BLUEPRINT_INPUT.md, and linked specs. Structured confirmed data is authoritative. DeepSeek remains isolated and optional.

# 5. Files to Read First
AGENTS.md; COMMANDS.md; .agent/GRAPH.md; .agent/LOOPS.md; ARCHITECTURE.md; SECURITY.md; BLUEPRINT_INPUT.md.

# 6. Expected Changed Files
- packages/auth
- packages/crypto
- packages/audit
- compliance

# 7. Interfaces and Contracts
Use canonical vocabulary from SPEC-001, SPEC-002, and SPEC-003. No new names without a decision entry.

# 8. Milestones

### M1: Implement bounded scope
GOAL: Produce the node's real implementation and documentation with no production placeholders.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; linked specs.
CHANGE: packages/auth, packages/crypto, packages/audit, compliance.
CONTENT: Implement exact behavior required by the linked specs and invariants. For any repo-dependent file, inspect the pinned package API before composition and record evidence.
RUN: `sh scripts/install.sh`; `sh scripts/lint.sh`; `sh scripts/typecheck.sh`.
EXPECT: `install: ok`; `lint: ok`; `typecheck: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-006 MILESTONE_PASS "M1 install: ok lint: ok typecheck: ok"`.
FALLBACK: Reduce internal abstraction while preserving all named behavior and security boundaries.
COMMIT: `git add -A && git commit -m "[EP-006][M1] implement bounded scope"`.

### M2: Prove node behavior
GOAL: Prove the implementation through real tests and the node verify command.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; TESTING.md.
CHANGE: packages/auth, packages/crypto, packages/audit, compliance, tests.
CONTENT: Add real unit, integration, E2E, security, privacy, or live-fire proof required for this node; no mock of the behavior under test.
RUN: `sh scripts/verify.sh`.
EXPECT: `verify: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-006 MILESTONE_PASS "M2 verify: ok"`.
FALLBACK: Isolate the failing capability and use the simplest real provider-compatible implementation allowed by the specs.
COMMIT: `git add -A && git commit -m "[EP-006][M2] prove node behavior"`.

# 9. Validation and Acceptance
The verify sentinel is observed in this session, changed paths match this plan, all expected files exist, no reality-gate hit exists, and privacy and security invariants remain true.

# 10. Idempotence and Recovery
Re-enter from the first unchecked milestone after verifying the previous checkpoint. Use green tags and the rollback ladder. Never cross a completed node tag.

# 11. Progress
- [ ] M1 Implement bounded scope
- [ ] M2 Prove node behavior

# 12. Surprises & Discoveries
- None recorded.

# 13. Decision Log
- None recorded.

# 14. Outcomes & Retrospective
- Complete only after NODE_DONE.
=== END FILE ===

=== FILE: .agent/execplans/EP-007-testing-hardening.md ===
NODE-META-BEGIN
ID: EP-007
DEPS: EP-005,EP-006
MAX_ATTEMPTS_PER_MILESTONE: 6
VERIFY: sh scripts/verify.sh
VERIFY_SENTINEL: verify: ok
GREEN_TAG: green/EP-007
NODE-META-END

# 1. Purpose / Big Picture
Prove every outcome, forced failure, performance, accessibility, tenant isolation, and no-fabrication rules.

# 2. Scope
Only the capabilities named by this node and its linked specs.

# 3. Non-goals
No unrelated refactor, new provider, secret storage, legal advice, model promise, or production deployment.

# 4. Context and Orientation
Read AGENTS.md, ARCHITECTURE.md, SECURITY.md, BLUEPRINT_INPUT.md, and linked specs. Structured confirmed data is authoritative. DeepSeek remains isolated and optional.

# 5. Files to Read First
AGENTS.md; COMMANDS.md; .agent/GRAPH.md; .agent/LOOPS.md; ARCHITECTURE.md; SECURITY.md; BLUEPRINT_INPUT.md.

# 6. Expected Changed Files
- tests
- scripts/live-fire.sh

# 7. Interfaces and Contracts
Use canonical vocabulary from SPEC-001, SPEC-002, and SPEC-003. No new names without a decision entry.

# 8. Milestones

### M1: Implement bounded scope
GOAL: Produce the node's real implementation and documentation with no production placeholders.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; linked specs.
CHANGE: tests, scripts/live-fire.sh.
CONTENT: Implement exact behavior required by the linked specs and invariants. For any repo-dependent file, inspect the pinned package API before composition and record evidence.
RUN: `sh scripts/install.sh`; `sh scripts/lint.sh`; `sh scripts/typecheck.sh`.
EXPECT: `install: ok`; `lint: ok`; `typecheck: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-007 MILESTONE_PASS "M1 install: ok lint: ok typecheck: ok"`.
FALLBACK: Reduce internal abstraction while preserving all named behavior and security boundaries.
COMMIT: `git add -A && git commit -m "[EP-007][M1] implement bounded scope"`.

### M2: Prove node behavior
GOAL: Prove the implementation through real tests and the node verify command.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; TESTING.md.
CHANGE: tests, scripts/live-fire.sh, tests.
CONTENT: Add real unit, integration, E2E, security, privacy, or live-fire proof required for this node; no mock of the behavior under test.
RUN: `sh scripts/verify.sh`.
EXPECT: `verify: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-007 MILESTONE_PASS "M2 verify: ok"`.
FALLBACK: Isolate the failing capability and use the simplest real provider-compatible implementation allowed by the specs.
COMMIT: `git add -A && git commit -m "[EP-007][M2] prove node behavior"`.

# 9. Validation and Acceptance
The verify sentinel is observed in this session, changed paths match this plan, all expected files exist, no reality-gate hit exists, and privacy and security invariants remain true.

# 10. Idempotence and Recovery
Re-enter from the first unchecked milestone after verifying the previous checkpoint. Use green tags and the rollback ladder. Never cross a completed node tag.

# 11. Progress
- [ ] M1 Implement bounded scope
- [ ] M2 Prove node behavior

# 12. Surprises & Discoveries
- None recorded.

# 13. Decision Log
- None recorded.

# 14. Outcomes & Retrospective
- Complete only after NODE_DONE.
=== END FILE ===

=== FILE: .agent/execplans/EP-008-observability-and-operations.md ===
NODE-META-BEGIN
ID: EP-008
DEPS: EP-007
MAX_ATTEMPTS_PER_MILESTONE: 6
VERIFY: sh scripts/verify.sh
VERIFY_SENTINEL: verify: ok
GREEN_TAG: green/EP-008
NODE-META-END

# 1. Purpose / Big Picture
Implement content-free logs, metrics, traces, health, alerts, dashboards, backup, restore, and runbooks.

# 2. Scope
Only the capabilities named by this node and its linked specs.

# 3. Non-goals
No unrelated refactor, new provider, secret storage, legal advice, model promise, or production deployment.

# 4. Context and Orientation
Read AGENTS.md, ARCHITECTURE.md, SECURITY.md, BLUEPRINT_INPUT.md, and linked specs. Structured confirmed data is authoritative. DeepSeek remains isolated and optional.

# 5. Files to Read First
AGENTS.md; COMMANDS.md; .agent/GRAPH.md; .agent/LOOPS.md; ARCHITECTURE.md; SECURITY.md; BLUEPRINT_INPUT.md.

# 6. Expected Changed Files
- packages/observability
- OPERATIONS.md
- OBSERVABILITY.md

# 7. Interfaces and Contracts
Use canonical vocabulary from SPEC-001, SPEC-002, and SPEC-003. No new names without a decision entry.

# 8. Milestones

### M1: Implement bounded scope
GOAL: Produce the node's real implementation and documentation with no production placeholders.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; linked specs.
CHANGE: packages/observability, OPERATIONS.md, OBSERVABILITY.md.
CONTENT: Implement exact behavior required by the linked specs and invariants. For any repo-dependent file, inspect the pinned package API before composition and record evidence.
RUN: `sh scripts/install.sh`; `sh scripts/lint.sh`; `sh scripts/typecheck.sh`.
EXPECT: `install: ok`; `lint: ok`; `typecheck: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-008 MILESTONE_PASS "M1 install: ok lint: ok typecheck: ok"`.
FALLBACK: Reduce internal abstraction while preserving all named behavior and security boundaries.
COMMIT: `git add -A && git commit -m "[EP-008][M1] implement bounded scope"`.

### M2: Prove node behavior
GOAL: Prove the implementation through real tests and the node verify command.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; TESTING.md.
CHANGE: packages/observability, OPERATIONS.md, OBSERVABILITY.md, tests.
CONTENT: Add real unit, integration, E2E, security, privacy, or live-fire proof required for this node; no mock of the behavior under test.
RUN: `sh scripts/verify.sh`.
EXPECT: `verify: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-008 MILESTONE_PASS "M2 verify: ok"`.
FALLBACK: Isolate the failing capability and use the simplest real provider-compatible implementation allowed by the specs.
COMMIT: `git add -A && git commit -m "[EP-008][M2] prove node behavior"`.

# 9. Validation and Acceptance
The verify sentinel is observed in this session, changed paths match this plan, all expected files exist, no reality-gate hit exists, and privacy and security invariants remain true.

# 10. Idempotence and Recovery
Re-enter from the first unchecked milestone after verifying the previous checkpoint. Use green tags and the rollback ladder. Never cross a completed node tag.

# 11. Progress
- [ ] M1 Implement bounded scope
- [ ] M2 Prove node behavior

# 12. Surprises & Discoveries
- None recorded.

# 13. Decision Log
- None recorded.

# 14. Outcomes & Retrospective
- Complete only after NODE_DONE.
=== END FILE ===

=== FILE: .agent/execplans/EP-009-deployment-and-release.md ===
NODE-META-BEGIN
ID: EP-009
DEPS: EP-008
MAX_ATTEMPTS_PER_MILESTONE: 6
VERIFY: sh scripts/verify.sh
VERIFY_SENTINEL: verify: ok
GREEN_TAG: green/EP-009
NODE-META-END

# 1. Purpose / Big Picture
Build signed images, deploy staging, rehearse migration and rollback, and prepare manual production release.

# 2. Scope
Only the capabilities named by this node and its linked specs.

# 3. Non-goals
No unrelated refactor, new provider, secret storage, legal advice, model promise, or production deployment.

# 4. Context and Orientation
Read AGENTS.md, ARCHITECTURE.md, SECURITY.md, BLUEPRINT_INPUT.md, and linked specs. Structured confirmed data is authoritative. DeepSeek remains isolated and optional.

# 5. Files to Read First
AGENTS.md; COMMANDS.md; .agent/GRAPH.md; .agent/LOOPS.md; ARCHITECTURE.md; SECURITY.md; BLUEPRINT_INPUT.md.

# 6. Expected Changed Files
- Dockerfile
- fly.toml
- .github/workflows/release.yml

# 7. Interfaces and Contracts
Use canonical vocabulary from SPEC-001, SPEC-002, and SPEC-003. No new names without a decision entry.

# 8. Milestones

### M1: Implement bounded scope
GOAL: Produce the node's real implementation and documentation with no production placeholders.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; linked specs.
CHANGE: Dockerfile, fly.toml, .github/workflows/release.yml.
CONTENT: Implement exact behavior required by the linked specs and invariants. For any repo-dependent file, inspect the pinned package API before composition and record evidence.
RUN: `sh scripts/install.sh`; `sh scripts/lint.sh`; `sh scripts/typecheck.sh`.
EXPECT: `install: ok`; `lint: ok`; `typecheck: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-009 MILESTONE_PASS "M1 install: ok lint: ok typecheck: ok"`.
FALLBACK: Reduce internal abstraction while preserving all named behavior and security boundaries.
COMMIT: `git add -A && git commit -m "[EP-009][M1] implement bounded scope"`.

### M2: Prove node behavior
GOAL: Prove the implementation through real tests and the node verify command.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; TESTING.md.
CHANGE: Dockerfile, fly.toml, .github/workflows/release.yml, tests.
CONTENT: Add real unit, integration, E2E, security, privacy, or live-fire proof required for this node; no mock of the behavior under test.
RUN: `sh scripts/verify.sh`.
EXPECT: `verify: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-009 MILESTONE_PASS "M2 verify: ok"`.
FALLBACK: Isolate the failing capability and use the simplest real provider-compatible implementation allowed by the specs.
COMMIT: `git add -A && git commit -m "[EP-009][M2] prove node behavior"`.

# 9. Validation and Acceptance
The verify sentinel is observed in this session, changed paths match this plan, all expected files exist, no reality-gate hit exists, and privacy and security invariants remain true.

# 10. Idempotence and Recovery
Re-enter from the first unchecked milestone after verifying the previous checkpoint. Use green tags and the rollback ladder. Never cross a completed node tag.

# 11. Progress
- [ ] M1 Implement bounded scope
- [ ] M2 Prove node behavior

# 12. Surprises & Discoveries
- None recorded.

# 13. Decision Log
- None recorded.

# 14. Outcomes & Retrospective
- Complete only after NODE_DONE.
=== END FILE ===

=== FILE: .agent/execplans/EP-010-production-readiness-and-ship.md ===
NODE-META-BEGIN
ID: EP-010
DEPS: EP-009
MAX_ATTEMPTS_PER_MILESTONE: 6
VERIFY: sh scripts/production-readiness-check.sh
VERIFY_SENTINEL: production readiness: ok
GREEN_TAG: green/EP-010
NODE-META-END

# 1. Purpose / Big Picture
Run the complete ship gate, legal and vendor evidence checks, live-fire, release tag, and manual deploy instruction.

# 2. Scope
Only the capabilities named by this node and its linked specs.

# 3. Non-goals
No unrelated refactor, new provider, secret storage, legal advice, model promise, or production deployment.

# 4. Context and Orientation
Read AGENTS.md, ARCHITECTURE.md, SECURITY.md, BLUEPRINT_INPUT.md, and linked specs. Structured confirmed data is authoritative. DeepSeek remains isolated and optional.

# 5. Files to Read First
AGENTS.md; COMMANDS.md; .agent/GRAPH.md; .agent/LOOPS.md; ARCHITECTURE.md; SECURITY.md; BLUEPRINT_INPUT.md.

# 6. Expected Changed Files
- PRODUCTION_READINESS.md
- RELEASE.md
- .agent/state/LEDGER.md

# 7. Interfaces and Contracts
Use canonical vocabulary from SPEC-001, SPEC-002, and SPEC-003. No new names without a decision entry.

# 8. Milestones

### M1: Implement bounded scope
GOAL: Produce the node's real implementation and documentation with no production placeholders.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; linked specs.
CHANGE: PRODUCTION_READINESS.md, RELEASE.md, .agent/state/LEDGER.md.
CONTENT: Implement exact behavior required by the linked specs and invariants. For any repo-dependent file, inspect the pinned package API before composition and record evidence.
RUN: `sh scripts/install.sh`; `sh scripts/lint.sh`; `sh scripts/typecheck.sh`.
EXPECT: `install: ok`; `lint: ok`; `typecheck: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-010 MILESTONE_PASS "M1 install: ok lint: ok typecheck: ok"`.
FALLBACK: Reduce internal abstraction while preserving all named behavior and security boundaries.
COMMIT: `git add -A && git commit -m "[EP-010][M1] implement bounded scope"`.

### M2: Prove node behavior
GOAL: Prove the implementation through real tests and the node verify command.
READ: This milestone; Non-goals; `sh scripts/ledger.sh tail 15`; TESTING.md.
CHANGE: PRODUCTION_READINESS.md, RELEASE.md, .agent/state/LEDGER.md, tests.
CONTENT: Add real unit, integration, E2E, security, privacy, or live-fire proof required for this node; no mock of the behavior under test.
RUN: `sh scripts/production-readiness-check.sh`.
EXPECT: `production readiness: ok`.
EVIDENCE: `sh scripts/ledger.sh append <AGENT_ID> EP-010 MILESTONE_PASS "M2 production readiness: ok"`.
FALLBACK: Isolate the failing capability and use the simplest real provider-compatible implementation allowed by the specs.
COMMIT: `git add -A && git commit -m "[EP-010][M2] prove node behavior"`.

# 9. Validation and Acceptance
The verify sentinel is observed in this session, changed paths match this plan, all expected files exist, no reality-gate hit exists, and privacy and security invariants remain true.

# 10. Idempotence and Recovery
Re-enter from the first unchecked milestone after verifying the previous checkpoint. Use green tags and the rollback ladder. Never cross a completed node tag.

# 11. Progress
- [ ] M1 Implement bounded scope
- [ ] M2 Prove node behavior

# 12. Surprises & Discoveries
- None recorded.

# 13. Decision Log
- None recorded.

# 14. Outcomes & Retrospective
- Complete only after NODE_DONE.
=== END FILE ===

=== FILE: .agent/checklists/agent-readiness.md ===
# Agent Readiness Checklist
- [ ] Read AGENTS.md and the active ExecPlan.
- [ ] Run `sh scripts/preflight.sh` and observe `preflight: ok`.
- [ ] Run `sh scripts/ledger.sh tail 30`.
- [ ] Confirm changed paths match the active milestone.
- [ ] Run the active milestone commands and record exact sentinels.
- [ ] Review SECURITY.md and privacy controls affected by the change.
- [ ] Commit with the required node and milestone format.
=== END FILE ===

=== FILE: .agent/checklists/preflight.md ===
# Preflight Checklist
- [ ] Read AGENTS.md and the active ExecPlan.
- [ ] Run `sh scripts/preflight.sh` and observe `preflight: ok`.
- [ ] Run `sh scripts/ledger.sh tail 30`.
- [ ] Confirm changed paths match the active milestone.
- [ ] Run the active milestone commands and record exact sentinels.
- [ ] Review SECURITY.md and privacy controls affected by the change.
- [ ] Commit with the required node and milestone format.
=== END FILE ===

=== FILE: .agent/checklists/implementation.md ===
# Implementation Checklist
- [ ] Read AGENTS.md and the active ExecPlan.
- [ ] Run `sh scripts/preflight.sh` and observe `preflight: ok`.
- [ ] Run `sh scripts/ledger.sh tail 30`.
- [ ] Confirm changed paths match the active milestone.
- [ ] Run the active milestone commands and record exact sentinels.
- [ ] Review SECURITY.md and privacy controls affected by the change.
- [ ] Commit with the required node and milestone format.
=== END FILE ===

=== FILE: .agent/checklists/validation.md ===
# Validation Checklist
- [ ] Read AGENTS.md and the active ExecPlan.
- [ ] Run `sh scripts/preflight.sh` and observe `preflight: ok`.
- [ ] Run `sh scripts/ledger.sh tail 30`.
- [ ] Confirm changed paths match the active milestone.
- [ ] Run the active milestone commands and record exact sentinels.
- [ ] Review SECURITY.md and privacy controls affected by the change.
- [ ] Commit with the required node and milestone format.
=== END FILE ===

=== FILE: .agent/checklists/final-review.md ===
# Final Review Checklist
- [ ] Read AGENTS.md and the active ExecPlan.
- [ ] Run `sh scripts/preflight.sh` and observe `preflight: ok`.
- [ ] Run `sh scripts/ledger.sh tail 30`.
- [ ] Confirm changed paths match the active milestone.
- [ ] Run the active milestone commands and record exact sentinels.
- [ ] Review SECURITY.md and privacy controls affected by the change.
- [ ] Commit with the required node and milestone format.
=== END FILE ===

=== FILE: .agent/checklists/production-readiness.md ===
# Production Readiness Checklist
- [ ] Read AGENTS.md and the active ExecPlan.
- [ ] Run `sh scripts/preflight.sh` and observe `preflight: ok`.
- [ ] Run `sh scripts/ledger.sh tail 30`.
- [ ] Confirm changed paths match the active milestone.
- [ ] Run the active milestone commands and record exact sentinels.
- [ ] Review SECURITY.md and privacy controls affected by the change.
- [ ] Commit with the required node and milestone format.
=== END FILE ===

=== FILE: .agent/checklists/release.md ===
# Release Checklist
- [ ] Read AGENTS.md and the active ExecPlan.
- [ ] Run `sh scripts/preflight.sh` and observe `preflight: ok`.
- [ ] Run `sh scripts/ledger.sh tail 30`.
- [ ] Confirm changed paths match the active milestone.
- [ ] Run the active milestone commands and record exact sentinels.
- [ ] Review SECURITY.md and privacy controls affected by the change.
- [ ] Commit with the required node and milestone format.
=== END FILE ===

=== FILE: .agent/checklists/rollback.md ===
# Rollback Checklist
- [ ] Read AGENTS.md and the active ExecPlan.
- [ ] Run `sh scripts/preflight.sh` and observe `preflight: ok`.
- [ ] Run `sh scripts/ledger.sh tail 30`.
- [ ] Confirm changed paths match the active milestone.
- [ ] Run the active milestone commands and record exact sentinels.
- [ ] Review SECURITY.md and privacy controls affected by the change.
- [ ] Commit with the required node and milestone format.
=== END FILE ===

=== FILE: .agent/checklists/incident-response.md ===
# Incident Response Checklist
- [ ] Read AGENTS.md and the active ExecPlan.
- [ ] Run `sh scripts/preflight.sh` and observe `preflight: ok`.
- [ ] Run `sh scripts/ledger.sh tail 30`.
- [ ] Confirm changed paths match the active milestone.
- [ ] Run the active milestone commands and record exact sentinels.
- [ ] Review SECURITY.md and privacy controls affected by the change.
- [ ] Commit with the required node and milestone format.
=== END FILE ===

=== FILE: .agent/templates/execplan-template.md ===
# ExecPlan Template

Use the fourteen required sections and complete milestone grammar from `.agent/PLANS.md`.
=== END FILE ===

=== FILE: .agent/templates/spec-template.md ===
# Spec Template

Purpose, vocabulary, behaviors, inputs, outputs, errors, security, privacy, tests, non-goals, and acceptance.
=== END FILE ===

=== FILE: .agent/templates/adr-template.md ===
# ADR Template

ID, date, status, context, decision, alternatives, consequences, security and privacy impact, rollback, evidence.
=== END FILE ===

=== FILE: .agent/templates/test-case-template.md ===
# Test Case Template

Outcome, setup, real dependencies, action, observable effect, cleanup, failure evidence.
=== END FILE ===

=== FILE: .agent/templates/runbook-template.md ===
# Runbook Template

Signal, impact, safety, diagnostics, mitigation, verification, rollback, escalation, follow-up.
=== END FILE ===

=== FILE: scripts/install.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
corepack enable && pnpm install --frozen-lockfile
echo "install: ok"
=== END FILE ===

=== FILE: scripts/lint.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
pnpm lint
echo "lint: ok"
=== END FILE ===

=== FILE: scripts/format-check.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
pnpm format:check
echo "format check: ok"
=== END FILE ===

=== FILE: scripts/typecheck.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
pnpm typecheck
echo "typecheck: ok"
=== END FILE ===

=== FILE: scripts/test-unit.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
pnpm test:unit
echo "unit tests: ok"
=== END FILE ===

=== FILE: scripts/test-integration.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
pnpm test:integration
echo "integration tests: ok"
=== END FILE ===

=== FILE: scripts/test-e2e.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
pnpm test:e2e
echo "e2e tests: ok"
=== END FILE ===

=== FILE: scripts/build.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
pnpm build
echo "build: ok"
=== END FILE ===

=== FILE: scripts/security-check.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
pnpm security:check
echo "security check: ok"
=== END FILE ===

=== FILE: scripts/dependency-audit.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
pnpm audit --audit-level high
echo "dependency audit: ok"
=== END FILE ===

=== FILE: scripts/smoke-test.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
pnpm smoke
echo "smoke test: ok"
=== END FILE ===

=== FILE: scripts/live-fire.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
[ -f package.json ] || { echo "ERROR: package.json is created during EP-001; see .agent/execplans/EP-001-foundation.md" >&2; exit 1; }
pnpm live-fire
echo "live-fire: ok"
=== END FILE ===

=== FILE: scripts/verify.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
sh scripts/preflight.sh
sh scripts/lint.sh
sh scripts/format-check.sh
sh scripts/typecheck.sh
sh scripts/test-unit.sh
sh scripts/test-integration.sh
sh scripts/test-e2e.sh
sh scripts/build.sh
sh scripts/security-check.sh
sh scripts/dependency-audit.sh
sh scripts/reality-gate.sh
sh scripts/smoke-test.sh
sh scripts/live-fire.sh
echo "verify: ok"
=== END FILE ===

=== FILE: scripts/production-readiness-check.sh ===
#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
sh scripts/verify.sh
for f in compliance/evidence/counsel-approval.md compliance/evidence/deepseek-vendor-review.md compliance/evidence/dpia-approved.md compliance/evidence/insurance-certificate.md compliance/evidence/retention-schedule-approved.md compliance/evidence/data-region-verification.md compliance/evidence/data-broker-determination.md; do
  [ -s "$f" ] || { echo "production readiness: missing $f" >&2; exit 1; }
done
echo "production readiness: ok"
=== END FILE ===

=== FILE: scripts/reality-gate.sh ===
#!/usr/bin/env sh
# 6LAYER reality gate: lexical layer of the no-mock law.
set -eu
PAT=".agent/reality-patterns"
ALLOW=".agent/reality-allow"
[ -f "$PAT" ] || { echo "reality gate: missing $PAT" >&2; exit 1; }
[ -f "$ALLOW" ] || { echo "reality gate: missing $ALLOW" >&2; exit 1; }
SRC_DIRS="apps packages"
hits=0
for d in $SRC_DIRS; do
  [ -d "$d" ] || continue
  out=$(grep -RInE -f "$PAT" "$d" 2>/dev/null | grep -vE -f "$ALLOW" || true)
  if [ -n "$out" ]; then printf '%s
' "$out"; hits=1; fi
done
[ "$hits" -eq 0 ] || { echo "reality gate: FAIL (forbidden implementation markers listed above)" >&2; exit 1; }
echo "reality gate: ok"
=== END FILE ===

=== FILE: scripts/preflight.sh ===
#!/usr/bin/env sh
set -eu
fail() { echo "preflight: FAIL - $1" >&2; exit 1; }
[ -f AGENTS.md ] && [ -d .agent ] || fail "run from repository root"
for f in AGENTS.md COMMANDS.md PREFLIGHT.md .env.example .agent/GRAPH.md .agent/LOOPS.md .agent/state/LEDGER.md .agent/reality-patterns .agent/reality-allow; do [ -f "$f" ] || fail "missing required file: $f"; done
for t in git awk grep sed curl jq openssl node corepack pnpm docker; do command -v "$t" >/dev/null 2>&1 || fail "missing required tool: $t"; done
[ -f .env ] || fail "missing .env (copy .env.example, fill every REQUIRED value, rerun)"
set -a; . ./.env; set +a
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
awk '/^PREFLIGHT-TABLE-BEGIN$/{t=1;next} /^PREFLIGHT-TABLE-END$/{t=0} t && NF' PREFLIGHT.md > "$TMP"
[ -s "$TMP" ] || fail "PREFLIGHT-TABLE missing or empty"
if command -v timeout >/dev/null 2>&1; then TCMD="timeout 30"; else TCMD=""; fi
while IFS='|' read -r var req probe; do
  eval "val=\${$var:-}"
  if [ -z "$val" ]; then [ "$req" = OPTIONAL ] && continue; fail "env var not set: $var"; fi
  if [ "$probe" != "-" ]; then [ -f "$probe" ] || fail "missing probe: $probe"; $TCMD sh "$probe" >/dev/null 2>&1 || fail "credential probe failed: $var"; fi
done < "$TMP"
echo "preflight: ok"
=== END FILE ===

=== FILE: scripts/probes/database_url.sh ===
#!/usr/bin/env sh
set -eu
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "select 1" | grep -qx 1
=== END FILE ===

=== FILE: scripts/probes/redis_url.sh ===
#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 "${REDIS_HTTP_URL:-https://example.invalid}" >/dev/null
=== END FILE ===

=== FILE: scripts/probes/deepseek_api_key.sh ===
#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -H "Authorization: Bearer $DEEPSEEK_API_KEY" "$DEEPSEEK_BASE_URL/models" >/dev/null
=== END FILE ===

=== FILE: scripts/probes/r2.sh ===
#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 "$R2_ENDPOINT" >/dev/null || [ $? -eq 22 ]
=== END FILE ===

=== FILE: scripts/probes/stripe.sh ===
#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -u "$STRIPE_SECRET_KEY:" https://api.stripe.com/v1/balance >/dev/null
=== END FILE ===

=== FILE: scripts/probes/resend.sh ===
#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains >/dev/null
=== END FILE ===

=== FILE: scripts/probes/turnstile.sh ===
#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 https://challenges.cloudflare.com/turnstile/v0/siteverify -d "secret=$TURNSTILE_SECRET_KEY" -d "response=preflight-invalid-token" >/dev/null
=== END FILE ===

=== FILE: scripts/probes/sentry.sh ===
#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 "${SENTRY_DSN%/*}" >/dev/null || [ $? -eq 22 ]
=== END FILE ===

=== FILE: scripts/probes/fly.sh ===
#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -H "Authorization: Bearer $FLY_API_TOKEN" https://api.fly.io/graphql -H "content-type: application/json" --data-binary "{"query":"query { viewer { email } }"}" >/dev/null
=== END FILE ===

=== FILE: scripts/probes/github.sh ===
#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -H "Authorization: Bearer $GHCR_TOKEN" https://api.github.com/user >/dev/null
=== END FILE ===

=== FILE: scripts/probes/twilio.sh ===
#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID.json" >/dev/null
=== END FILE ===

=== FILE: scripts/probes/otel.sh ===
#!/usr/bin/env sh
set -eu
curl -fsS --max-time 20 -I "$OTEL_EXPORTER_OTLP_ENDPOINT" >/dev/null || [ $? -eq 22 ]
=== END FILE ===

=== FILE: HOW_TO_USE.md ===
# How to Use This Blueprint Pack

1. Materialize the pack by extracting the ZIP, or save the combined transcript as `BLUEPRINT_PACK.md` and use the included splitter.
2. Initialize git and commit: `git init && git add -A && git commit -m "[6LAYER] bootstrap blueprint pack"`.
3. Open PREFLIGHT.md, obtain every required credential and evidence file, copy `.env.example` to `.env`, and run `sh scripts/preflight.sh` until `preflight: ok`.
4. Launch any terminal agent with `.agent/prompts/run-graph.md`. Claude Code and Codex require their current non-interactive approval flags. Hermes and OpenClaw can receive the same prompt verbatim.
5. Observe with `tail -f .agent/state/LEDGER.md` and `git log --oneline`. Do not coordinate through chat memory.
6. If blocked, read the active ExecPlan report, make the one named decision, reset according to its recovery section, and relaunch.
7. Never implement from ROADMAP.md. Use single-node prompts for maintenance.
8. RUN_COMPLETE plus fresh verify and production-readiness sentinels is the ship decision. Production deployment remains manual.

## Splitter

#!/usr/bin/env sh
set -eu
pack="${1:-BLUEPRINT_PACK.md}"
[ -f "$pack" ] || { echo "unpack: missing $pack" >&2; exit 1; }
awk '
  /^=== FILE: /{
    path=substr($0, 11)
    sub(/ ===$/, "", path)
    cmd="mkdir -p \"$(dirname \"" path "\")\""
    system(cmd)
    printf "" > path
    out=1
    next
  }
  /^=== END FILE ===$/{ out=0; close(path); next }
  out { print >> path }
' "$pack"
echo "unpack: ok"
=== END FILE ===

=== PACK COMPLETE: 109 FILES ===
