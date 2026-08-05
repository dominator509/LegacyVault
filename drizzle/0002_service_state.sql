CREATE TABLE idempotency_records (
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status_code integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, household_id, idempotency_key),
  CHECK ((status_code IS NULL) = (response_body IS NULL))
);

CREATE TABLE billing_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  external_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  provider_created_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_error_class text
);

CREATE TABLE deletion_processor_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  processor text NOT NULL,
  external_request_id text,
  status text NOT NULL CHECK (status IN ('pending','submitted','confirmed','not-supported','failed')),
  requested_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  UNIQUE (workflow_id, processor)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['idempotency_records','billing_events','deletion_processor_requests']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I_tenant ON %I USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND household_id = nullif(current_setting(''app.household_id'', true), '''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND household_id = nullif(current_setting(''app.household_id'', true), '''')::uuid)', table_name, table_name);
  END LOOP;
END $$;
