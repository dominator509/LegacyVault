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
