CREATE TABLE household_keys (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  key_version integer NOT NULL CHECK (key_version > 0),
  wrapped_key jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('active','decrypt-only','retired')),
  created_at timestamptz NOT NULL,
  retired_at timestamptz,
  UNIQUE (household_id, key_version)
);

CREATE UNIQUE INDEX household_keys_one_active
  ON household_keys (household_id)
  WHERE status = 'active';

ALTER TABLE household_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY household_keys_tenant ON household_keys
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  );
