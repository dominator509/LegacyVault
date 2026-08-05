# Incident Response Plan

Status: engineering runbook pending named production contacts, counsel review,
provider escalation paths, and a completed exercise.

## Severity and immediate containment

Treat suspected tenant-boundary failure, export-signature failure, audit-chain
failure, unauthorized staff or emergency access, prohibited AI disclosure, and
active credential compromise as critical. Preserve evidence, stop the affected
feature or provider, revoke exposed sessions/keys where safe, and avoid deleting
records needed for investigation.

## Response sequence

1. Open an incident record with UTC timestamps and a non-sensitive summary.
2. Assign incident commander, security lead, privacy lead, operations lead, and
   communications/counsel contacts from the approved contact sheet.
3. Scope affected tenants, categories, regions, providers, versions, and time
   window using content-free logs and the append-only audit chain.
4. Contain at the narrowest boundary: disable a provider or feature, revoke
   sessions, isolate a worker, or roll back the image. Do not weaken tenant RLS,
   encryption, validation, or audit controls to restore availability.
5. Preserve database, object, deployment, access, and provider evidence with
   hashes and access records.
6. Eradicate the cause, rotate affected secrets/keys, and prove the smallest
   recovery path in staging or the local rehearsal environment.
7. Recover through `ROLLBACK.md`; verify health, tenant isolation, audit
   continuity, queue integrity, and data correctness before restoring traffic.
8. Counsel and the privacy lead determine notification duties and deadlines from
   verified facts. Engineering must not make an unsupported legal conclusion.
9. Complete a blameless review with corrective owners, deadlines, regression
   tests, and updated threat/control traceability.

## Evidence to capture

- Incident ID, detection source, UTC timeline, decision log, and responders
- Affected releases, services, tenants, data categories, and record counts
- Content-free query results and cryptographic hashes of retained evidence
- Containment, rotation, rollback, restore, and post-recovery commands/results
- Provider tickets and notices, counsel decisions, user/regulator notices
- Corrective changes, test sentinels, and exercise follow-up

## Production blockers

`compliance/evidence/` must contain approved contacts and escalation routes, a
completed incident exercise, and counsel-approved notification decision rules.
Place no credentials or unnecessary personal data in incident artifacts.
