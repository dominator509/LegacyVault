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
| ADR-009 | Continue independent engineering while EP-000 remains externally unverified | Explicit operator instruction requires maximum local completion; the original node, preflight sentinel, graph dependency, legal gates, and production ship gate remain unchanged and no external result may be fabricated | Accepted for this run |
| ADR-010 | Add explicit bootstrap diagnostics, package metadata inspection, local environment, Compose, and migration commands | `ENVIRONMENT.md`, the operator's unattended-run requirements, and the EP-001 toolchain scope require reproducible commands that were absent from `COMMANDS.md` | Accepted |
| ADR-011 | Generate the pnpm lockfile only on the first EP-001 install and freeze every later install | The original install gate failed with `ERR_PNPM_NO_LOCKFILE` while EP-001 is explicitly responsible for creating `pnpm-lock.yaml` | Accepted |

Add a decision before introducing a new canonical name, dependency, provider promise, data category, or exception. Use `.agent/templates/adr-template.md`.
