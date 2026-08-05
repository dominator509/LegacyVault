CREATE TABLE support_access_approvals (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  support_membership_id uuid NOT NULL,
  approved_by_owner_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (length(reason_code) BETWEEN 3 AND 120),
  categories jsonb NOT NULL,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (expires_at > starts_at),
  CHECK (expires_at <= starts_at + interval '4 hours')
);

CREATE INDEX support_access_active_idx
  ON support_access_approvals (household_id, support_membership_id, starts_at, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE support_access_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_access_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY support_access_approvals_tenant ON support_access_approvals
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  );
