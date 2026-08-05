# Production Readiness Checklist
- [ ] Read AGENTS.md and the active ExecPlan.
- [ ] Run `sh scripts/preflight.sh` and observe `preflight: ok`.
- [ ] Run `sh scripts/ledger.sh tail 30`.
- [ ] Confirm changed paths match the active milestone.
- [ ] Run the active milestone commands and record exact sentinels.
- [ ] Review SECURITY.md and privacy controls affected by the change.
- [ ] Commit with the required node and milestone format.
