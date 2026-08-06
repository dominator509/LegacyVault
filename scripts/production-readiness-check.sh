#!/usr/bin/env sh
set -eu
export CI=true GIT_TERMINAL_PROMPT=0 GIT_PAGER=cat PAGER=cat DEBIAN_FRONTEND=noninteractive
sh scripts/verify.sh
for f in compliance/evidence/counsel-approval.md compliance/evidence/deepseek-vendor-review.md compliance/evidence/deepseek-terms-snapshot.html compliance/evidence/deepseek-privacy-snapshot.html compliance/evidence/dpia-approved.md compliance/evidence/subprocessor-register-approved.md compliance/evidence/insurance-certificate.md compliance/evidence/retention-schedule-approved.md compliance/evidence/data-region-verification.md compliance/evidence/data-broker-determination.md; do
  [ -s "$f" ] || { echo "production readiness: missing $f" >&2; exit 1; }
done
echo "production readiness: ok"
