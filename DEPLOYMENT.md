# Deployment

Build one immutable OCI image per app and worker. GitHub Actions runs verify, builds and signs images, deploys staging, runs smoke and live-fire, and prepares production. Production is MANUAL: `fly deploy --app "$FLY_APP_PRODUCTION" --image "ghcr.io/$GHCR_OWNER/legacy-vault:$RELEASE_TAG" --strategy rolling`. Run migrations with a release command before traffic only when backward compatible. Rollback uses the prior signed image and compatible schema.
