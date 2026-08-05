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
| ADR-012 | Use pinned PostgreSQL 17, Valkey, MinIO, and Mailpit containers for real local protocols | The blueprint explicitly permits protocol-compatible local infrastructure; these services cover database, queue/cache, S3, and SMTP without claiming hosted-provider verification | Accepted for local and test only |
| ADR-013 | Add `LOCAL_*` variables only for ignored development configuration | Compose requires credentials that must not reuse production provider secrets; the generator creates independent values and production configuration rejects local engineering mode | Accepted for local and test only |
| ADR-014 | Make database and Redis probes protocol-real and shell-portable | The database probe passed in login Git Bash but failed from preflight because `psql` was not on the non-login path; the Redis probe incorrectly targeted an undeclared HTTP URL and could not validate `REDIS_URL` | Accepted |
| ADR-015 | Use GNU `timeout` only when positively identified and bound each local probe internally | Git Bash resolved `timeout` to Windows `timeout.exe`, which returned exit 1 for POSIX syntax and made every credential look invalid | Accepted |
| ADR-016 | Format implementation artifacts but exclude immutable blueprint prose and generated lockfiles | The first format check reported 60 files, predominantly L1-L4 control documents that must not be mechanically rewritten | Accepted |
| ADR-017 | Permit one explicit lock refresh after reviewed exact manifest changes, followed by frozen install and audit | Workspace packages and approved dependencies added by later graph nodes must update the lockfile without making ordinary installs mutable | Accepted |
| ADR-018 | Pin the official ClamAV 1.4.5 Debian slim image by digest and expose clamd on loopback only for local document scans | The blueprint requires local malware scanning; the exact image digest makes local proof reproducible and does not imply hosted production verification | Accepted for local and test only |

Add a decision before introducing a new canonical name, dependency, provider promise, data category, or exception. Use `.agent/templates/adr-template.md`.
