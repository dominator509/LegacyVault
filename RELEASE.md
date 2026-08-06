# Release

Use a reviewed semantic version as the immutable release tag. A release candidate is eligible for staging only after a clean working tree, current dependency audit, four successful local OCI target builds, combined-container rehearsal, idempotent migration plus restore rehearsal, and a fresh `production readiness: ok` sentinel.

Dispatch `.github/workflows/release.yml` with the exact release tag. The workflow fails closed unless its explicit GitHub secret and variable inventory, required evidence files, real service probes, full verify sequence, image builds, keyless signatures, named Fly staging deploy, and HTTPS staging probes all pass. Record all four digests and signature transparency evidence. A mutable tag is never rollback evidence.

Before production, archive staging results, policy and legal artifact hashes, vendor and subprocessor approvals, manual accessibility results, measured performance, incident drill, managed restore result, schema compatibility decision, and the prior signed digest. There must be zero critical or high security defects and no unexplained working-tree changes.

Production approval and deploy are manual. Use only the exact command in `DEPLOYMENT.md`, record the operator and timestamp, then run post-deployment smoke/live-fire and monitor availability, authentication failures, queue depth, privacy backlog, provider failures, and audit-chain signals for 24 hours. Roll back only to the recorded compatible signed digest; never reverse an incompatible contract migration ad hoc.
