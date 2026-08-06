ALTER TABLE privacy_requests ADD COLUMN verified_at timestamptz;
ALTER TABLE privacy_requests ADD COLUMN recovery_until timestamptz;
ALTER TABLE privacy_requests ADD COLUMN completed_at timestamptz;

ALTER TABLE privacy_requests ADD CONSTRAINT privacy_requests_deletion_timing_valid
  CHECK (
    (verified_at IS NULL AND recovery_until IS NULL)
    OR (verified_at IS NOT NULL AND recovery_until IS NOT NULL AND recovery_until > verified_at)
  );

ALTER TABLE workflow_runs ADD CONSTRAINT workflow_subject_pair_valid
  CHECK ((subject_type IS NULL) = (subject_id IS NULL)) NOT VALID;

CREATE TABLE deletion_executions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  privacy_request_id uuid NOT NULL UNIQUE,
  workflow_id uuid NOT NULL UNIQUE,
  person_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN (
    'recovery-period',
    'active-system',
    'awaiting-review',
    'awaiting-processors',
    'awaiting-backup-expiry',
    'completed',
    'cancelled',
    'blocked-legal-hold',
    'failed'
  )),
  recovery_until timestamptz NOT NULL,
  active_system_completed_at timestamptz,
  backup_expires_at timestamptz,
  completed_at timestamptz,
  retained_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  shared_data_review_required boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE legal_holds (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN (
    'confirmed-facts',
    'original-documents',
    'ocr-temporary-files',
    'candidate-facts',
    'ai-request-metadata',
    'audit-events',
    'consent-acceptance',
    'billing-records',
    'security-logs',
    'backups',
    'privacy-request-evidence'
  )),
  subject_type text NOT NULL CHECK (subject_type IN ('Household','Person')),
  subject_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (length(reason_code) BETWEEN 3 AND 120),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz,
  released_at timestamptz,
  created_by uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (expires_at IS NULL OR expires_at > starts_at)
);

CREATE INDEX legal_holds_active_subject_idx
  ON legal_holds (household_id, subject_type, subject_id, category)
  WHERE released_at IS NULL;

ALTER TABLE deletion_processor_requests DROP CONSTRAINT deletion_processor_requests_status_check;
ALTER TABLE deletion_processor_requests ADD CONSTRAINT deletion_processor_requests_status_check
  CHECK (status IN ('pending','submitted','confirmed','not-supported','verification-required','failed'));

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['deletion_executions','legal_holds']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I_tenant ON %I USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND household_id = nullif(current_setting(''app.household_id'', true), '''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND household_id = nullif(current_setting(''app.household_id'', true), '''')::uuid)', table_name, table_name);
  END LOOP;
END $$;
