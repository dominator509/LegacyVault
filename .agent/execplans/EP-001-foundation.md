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
- [x] M1 Implement bounded scope
- [ ] M2 Prove node behavior
- [x] Continuation proof: unit, real local integration, TCP E2E, smoke, build, format, security, dependency audit, and reality gates pass; full verify remains externally gated.

# 12. Surprises & Discoveries
- The original install gate required a frozen lockfile before EP-001 had created one; ADR-011 permits first-generation only and freezes every subsequent install.
- The installed Docker client initially had no running engine; Docker Desktop started successfully and reported Engine 29.5.3.
- Windows HNS excluded ports 55284-55783; the local stack uses 15432, 16379, 19000, and 19001 and all four services are healthy.
- Preflight now passes real local PostgreSQL and Valkey probes and stops at the first genuinely missing external item, `DEEPSEEK_API_KEY`.

# 13. Decision Log
- ADR-010 added the missing authorized bootstrap, local-infrastructure, and migration commands.
- ADR-011 defined deterministic first-lockfile generation.

# 14. Outcomes & Retrospective
- Foundation engineering checkpoint is locally proven but the node remains incomplete: no M2 sentinel, NODE_DONE, or green tag exists while external preflight requirements remain unsupplied.
