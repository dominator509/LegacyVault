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
