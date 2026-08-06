CREATE TABLE account_idempotency_records (
  auth_user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (auth_user_id, idempotency_key)
);

CREATE TABLE membership_invitations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  email_hash text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  role text NOT NULL,
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by_auth_user_id text REFERENCES "user" ("id") ON DELETE SET NULL,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE UNIQUE INDEX membership_invitations_active_email_unique
  ON membership_invitations (organization_id, household_id, email_hash)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE account_idempotency_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_idempotency_records_self ON account_idempotency_records
  USING (auth_user_id = nullif(current_setting('app.auth_user_id', true), ''))
  WITH CHECK (auth_user_id = nullif(current_setting('app.auth_user_id', true), ''));

ALTER TABLE membership_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_invitations_tenant ON membership_invitations
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  );
CREATE POLICY membership_invitations_token ON membership_invitations
  FOR SELECT
  USING (token_hash = nullif(current_setting('app.invitation_token_hash', true), ''));

CREATE POLICY households_auth_member ON households
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.household_id = households.id
        AND memberships.organization_id = households.organization_id
        AND memberships.active = 1
        AND memberships.auth_user_id = nullif(current_setting('app.auth_user_id', true), '')
    )
  );

CREATE POLICY organizations_auth_member ON organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.organization_id = organizations.id
        AND memberships.active = 1
        AND memberships.auth_user_id = nullif(current_setting('app.auth_user_id', true), '')
    )
  );
