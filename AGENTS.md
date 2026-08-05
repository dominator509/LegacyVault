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
