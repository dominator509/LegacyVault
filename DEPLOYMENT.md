# Deployment

GitHub Actions is the staging release authority. A manual dispatch first generates isolated local service secrets, overlays only the explicit external CI allowlist, starts real dependencies, migrates, and requires `production readiness: ok`. It then builds API, web, worker, and combined release targets from the digest-pinned Dockerfile, pushes all four immutable artifacts to GHCR, signs every digest with keyless Cosign, deploys the combined digest to the exact named staging Fly app, and runs HTTPS smoke and unauthorized-boundary live-fire probes.

The combined image runs the same API, web, and worker package commands as the separate artifacts. It binds web to 3000, API to loopback-accessible 3001, fails the container if any process exits, forwards termination signals, and permits the single named Fly application to serve Next.js while its server routes proxy to the colocated API. Fly's release command runs the advisory-lock and checksum-protected migrations before traffic. Only backward-compatible expand/migrate changes may enter this path.

Production is never automatic. After staging evidence, policy/vendor/legal/insurance evidence, digest signatures, restore results, and schema compatibility have been reviewed, an operator sets an immutable tag and runs exactly:

`fly deploy --app "$FLY_APP_PRODUCTION" --image "ghcr.io/$GHCR_OWNER/legacy-vault:$RELEASE_TAG" --strategy rolling`

The operator records the deployed digest, prior signed digest, migration checksum set, smoke result, and approval evidence. Rollback uses the prior verified signed digest, never a mutable tag:

`cosign verify "ghcr.io/$GHCR_OWNER/legacy-vault@$PRIOR_IMAGE_DIGEST"`

`fly deploy --app "$FLY_APP_PRODUCTION" --image "ghcr.io/$GHCR_OWNER/legacy-vault@$PRIOR_IMAGE_DIGEST" --strategy rolling`

Rollback is prohibited when a completed contract migration makes the prior image incompatible. In that case, use the documented database recovery decision path and incident process; do not reverse migrations ad hoc.
