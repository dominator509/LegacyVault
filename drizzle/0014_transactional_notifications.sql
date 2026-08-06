ALTER TABLE reports ADD COLUMN requested_by uuid;

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  recipient_person_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('annual-review-ready')),
  status text NOT NULL CHECK (status IN ('pending','sent','failed')),
  provider_message_id text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_class text,
  created_at timestamptz NOT NULL,
  sent_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workflow_id, recipient_person_id, kind),
  CHECK (
    (status='sent' AND provider_message_id IS NOT NULL AND sent_at IS NOT NULL)
    OR status<>'sent'
  )
);

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_deliveries_tenant ON notification_deliveries
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  );
