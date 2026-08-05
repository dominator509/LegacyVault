CREATE TABLE document_derivatives (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES documents(id),
  kind text NOT NULL CHECK (kind IN ('searchable-pdf')),
  object_key text NOT NULL UNIQUE,
  ciphertext_sha256 text NOT NULL CHECK (ciphertext_sha256 ~ '^[0-9a-f]{64}$'),
  encryption_key_version integer NOT NULL CHECK (encryption_key_version > 0),
  created_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (document_id, kind)
);

ALTER TABLE document_derivatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_derivatives FORCE ROW LEVEL SECURITY;
CREATE POLICY document_derivatives_tenant ON document_derivatives
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  );
