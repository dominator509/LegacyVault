ALTER TABLE documents
  ADD COLUMN delete_original_after_processing boolean NOT NULL DEFAULT false,
  ADD COLUMN original_deleted_at timestamptz;

CREATE TABLE document_consents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  document_id uuid NOT NULL UNIQUE,
  person_id uuid NOT NULL,
  policy_version text NOT NULL,
  granted_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

ALTER TABLE document_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_consents FORCE ROW LEVEL SECURITY;
CREATE POLICY document_consents_tenant ON document_consents
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  );
