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
- [x] M1 Implement bounded scope
- [ ] M2 Prove node behavior
- [x] Continuation proof: real migrations and 3 PostgreSQL RLS/integrity tests pass within the 5-test integration suite; format, build, security, audit, and reality gates pass.

# 12. Surprises & Discoveries
- Strict pnpm isolation prevents root tests from importing package-private `pg`; the database package now exposes its client factory as the approved infrastructure boundary.

# 13. Decision Log
- ADR-017 governs the exact Drizzle/PostgreSQL lockfile refresh.

# 14. Outcomes & Retrospective
- Persistence engineering is locally proven. The M2 `verify: ok` sentinel, NODE_DONE, and green tag remain withheld because external preflight requirements are unchanged.
