ALTER TABLE workflow_runs ADD COLUMN subject_type text;
ALTER TABLE workflow_runs ADD COLUMN subject_id uuid;

CREATE TABLE exports (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  workflow_id uuid NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending','building','completed','failed','expired')),
  wrapped_export_key jsonb NOT NULL,
  encryption_key_version integer NOT NULL CHECK (encryption_key_version > 0),
  object_key text,
  archive_sha256 text CHECK (archive_sha256 IS NULL OR archive_sha256 ~ '^[0-9a-f]{64}$'),
  signer_public_key text,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK ((status = 'completed') = (object_key IS NOT NULL AND archive_sha256 IS NOT NULL AND signer_public_key IS NOT NULL AND completed_at IS NOT NULL))
);

ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports FORCE ROW LEVEL SECURITY;
CREATE POLICY exports_tenant ON exports
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  );
