CREATE TABLE organizations (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE households (id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL, last_reviewed_at timestamptz, version integer NOT NULL DEFAULT 1 CHECK (version > 0));
CREATE TABLE people (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, display_name_encrypted bytea NOT NULL, key_version integer NOT NULL CHECK (key_version > 0), version integer NOT NULL DEFAULT 1 CHECK (version > 0));
CREATE TABLE memberships (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, person_id uuid NOT NULL, role text NOT NULL, active integer NOT NULL DEFAULT 1 CHECK (active IN (0,1)), version integer NOT NULL DEFAULT 1 CHECK (version > 0));
CREATE TABLE permission_grants (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, membership_id uuid NOT NULL, categories jsonb NOT NULL, actions jsonb NOT NULL, purpose text NOT NULL, starts_at timestamptz NOT NULL, expires_at timestamptz, revoked_at timestamptz, version integer NOT NULL DEFAULT 1 CHECK (version > 0));
CREATE TABLE documents (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, object_key text NOT NULL UNIQUE, original_sha256 text NOT NULL CHECK (original_sha256 ~ '^[0-9a-f]{64}$'), media_type text NOT NULL, status text NOT NULL CHECK (status IN ('pending','quarantined','clean','rejected','deleted')), encryption_key_version integer NOT NULL CHECK (encryption_key_version > 0), version integer NOT NULL DEFAULT 1 CHECK (version > 0));
CREATE TABLE evidence (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, source_type text NOT NULL, source_id uuid NOT NULL, locator text NOT NULL, captured_at timestamptz NOT NULL, version integer NOT NULL DEFAULT 1 CHECK (version > 0));
CREATE TABLE facts (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, field_key text NOT NULL, typed_value_encrypted bytea NOT NULL, key_version integer NOT NULL CHECK (key_version > 0), status text NOT NULL CHECK (status IN ('candidate','confirmed','rejected','disputed')), source_type text NOT NULL, source_id uuid NOT NULL, evidence_ids jsonb NOT NULL, confidence numeric(5,4) CHECK (confidence BETWEEN 0 AND 1), sensitivity text NOT NULL, confirmed_by uuid, confirmed_at timestamptz, last_reviewed_at timestamptz, version integer NOT NULL DEFAULT 1 CHECK (version > 0), CHECK ((status = 'confirmed') = (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)));
CREATE TABLE consents (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, person_id uuid NOT NULL, purpose text NOT NULL, policy_version text NOT NULL, granted_at timestamptz NOT NULL, withdrawn_at timestamptz, version integer NOT NULL DEFAULT 1 CHECK (version > 0));
CREATE TABLE emergency_access_requests (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, requester_id uuid NOT NULL, recipient_membership_id uuid NOT NULL, categories jsonb NOT NULL, reason_encrypted bytea NOT NULL, key_version integer NOT NULL CHECK (key_version > 0), status text NOT NULL, requested_at timestamptz NOT NULL, decision_at timestamptz, release_after timestamptz, version integer NOT NULL DEFAULT 1 CHECK (version > 0));
CREATE TABLE reports (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, kind text NOT NULL, generated_at timestamptz NOT NULL, claims jsonb NOT NULL, source_fact_versions jsonb NOT NULL, version integer NOT NULL DEFAULT 1 CHECK (version > 0));
CREATE TABLE workflow_runs (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, kind text NOT NULL, idempotency_key text NOT NULL, status text NOT NULL, completed_steps jsonb NOT NULL, next_step text, last_error_class text, version integer NOT NULL DEFAULT 1 CHECK (version > 0), UNIQUE (organization_id, household_id, idempotency_key));
CREATE TABLE privacy_requests (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, person_id uuid NOT NULL, kind text NOT NULL, status text NOT NULL, requested_at timestamptz NOT NULL, version integer NOT NULL DEFAULT 1 CHECK (version > 0));
CREATE TABLE subscriptions (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, status text NOT NULL, plan text NOT NULL, provider_customer_id text, provider_subscription_id text, version integer NOT NULL DEFAULT 1 CHECK (version > 0));
CREATE TABLE audit_events (id uuid PRIMARY KEY, organization_id uuid NOT NULL, household_id uuid NOT NULL, sequence integer NOT NULL CHECK (sequence > 0), occurred_at timestamptz NOT NULL, actor_pseudonym text NOT NULL, action text NOT NULL, outcome text NOT NULL, metadata jsonb NOT NULL, previous_hash text NOT NULL, event_hash text NOT NULL, UNIQUE (household_id, sequence), UNIQUE (event_hash));

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_tenant ON organizations USING (id = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK (id = nullif(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE households FORCE ROW LEVEL SECURITY;
CREATE POLICY households_tenant ON households USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid AND id = nullif(current_setting('app.household_id', true), '')::uuid) WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid AND id = nullif(current_setting('app.household_id', true), '')::uuid);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['people','memberships','permission_grants','documents','evidence','facts','consents','emergency_access_requests','reports','workflow_runs','privacy_requests','subscriptions','audit_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I_tenant ON %I USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND household_id = nullif(current_setting(''app.household_id'', true), '''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND household_id = nullif(current_setting(''app.household_id'', true), '''')::uuid)', table_name, table_name);
  END LOOP;
END $$;
