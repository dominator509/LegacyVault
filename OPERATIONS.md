# Operations

## Operating boundary

Production deployment is manual and remains blocked until every external and legal gate passes. Operators must never copy vault payloads, documents, prompts, model outputs, credentials, signed URLs, or raw identifiers into tickets, chat, dashboards, traces, or incident notes.

## Health and readiness

- `/health/live` proves only that the API process can answer.
- `/health/ready` is the load-balancer gate. A production instance is not ready without its required configuration and dependency checks.
- `/health/dependencies` reports configured/degraded state without secret values or customer data.

Readiness failures remove the instance from service. Liveness failures restart it. A degraded optional provider disables only its bounded feature; it does not convert failure into success.

## Service lifecycle

Start local dependencies with `docker compose up -d --wait`, apply migrations with `pnpm db:migrate`, and run `sh scripts/smoke-test.sh`. Stop them with `docker compose down`; ordinary teardown does not delete volumes. API and worker background commands and PID files are defined in `COMMANDS.md`.

## Backup and restore

`sh scripts/local-backup.sh` creates an ignored PostgreSQL custom-format dump plus SHA-256 sidecar under `.agent/state/backups/`. It contains sensitive test data and must not be committed or uploaded.

`sh scripts/local-restore-drill.sh` restores the newest dump into a validated ephemeral database, compares migration, organization, household, and workflow counts to the source, and drops the drill database. It is fail-closed and local-only. A passing local drill does not prove managed-provider point-in-time recovery, encryption custody, off-site retention, or production recovery objectives.

Production requires:

1. Provider-native continuous recovery and encrypted daily logical backups.
2. A business-approved recovery point objective and recovery time objective.
3. Quarterly restore evidence into an isolated recovery environment.
4. Application smoke, audit-chain verification, object-reference reconciliation, and access review after restoration.
5. Recorded backup age, checksum, key version, restore duration, verifier, and cleanup evidence without payloads.

## Alert response

| Alert | First bounded action | Runbook outcome |
|---|---|---|
| Tenant-isolation denial | Remove affected route or tenant scope from service and preserve content-free request/trace IDs | Security incident; verify RLS and authorization before restoring traffic |
| Audit-chain failure | Stop consequential writes for the tenant and preserve database/audit-key evidence | Integrity incident; do not rewrite the chain |
| Backup failure | Page operations, retain the last verified backup, and run a new bounded backup | Release blocked until backup and restore proofs pass |
| Authentication attack | Apply configured rate limits, inspect pseudonymous source/session signals, and protect recovery paths | Never disable MFA or verification to reduce load |
| Deletion or privacy SLA | Stop adding backlog, verify worker/processor states, and notify the privacy owner | Do not fabricate processor completion |
| Repeated export/report failure | Disable new generation while preserving existing encrypted artifacts | Verify queue, object store, key version, and idempotency evidence |

## Incident handling

Follow `.agent/checklists/incident-response.md` and `INCIDENT_RESPONSE_PLAN.md`. Severity is based on confidentiality, integrity, availability, tenant scope, legal deadlines, and evidence—not alert volume. Preserve content-free logs and immutable audit evidence, rotate only affected credentials, and use the documented rollback protocol.

## Routine reviews

- Daily: readiness, queue backlog, backup age, security alerts, deletion/privacy age.
- Weekly: failed workflows, cache effectiveness/cost, auth anomalies, object failures, dependency advisories.
- Monthly: access and support grants, audit-chain verification, alert routing, restore prerequisites.
- Quarterly: isolated restore, incident exercise, rollback drill, data-retention evidence, vendor/subprocessor review.
