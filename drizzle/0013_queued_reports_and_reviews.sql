ALTER TABLE reports ADD COLUMN workflow_id uuid;
ALTER TABLE reports ADD COLUMN status text NOT NULL DEFAULT 'completed';
ALTER TABLE reports ADD COLUMN completed_at timestamptz;
ALTER TABLE reports ADD COLUMN payload_encrypted bytea;
ALTER TABLE reports ADD COLUMN encryption_key_version integer;

UPDATE reports SET completed_at=generated_at WHERE completed_at IS NULL;

ALTER TABLE reports ADD CONSTRAINT reports_status_valid
  CHECK (status IN ('pending','completed','failed'));
ALTER TABLE reports ADD CONSTRAINT reports_completion_valid
  CHECK (
    (status='pending' AND completed_at IS NULL AND payload_encrypted IS NULL AND encryption_key_version IS NULL)
    OR (status='completed' AND completed_at IS NOT NULL AND payload_encrypted IS NOT NULL AND encryption_key_version > 0)
    OR status='failed'
  ) NOT VALID;
CREATE UNIQUE INDEX reports_workflow_unique ON reports (workflow_id) WHERE workflow_id IS NOT NULL;

ALTER TABLE documents ADD COLUMN expires_at timestamptz;
CREATE INDEX documents_expiry_idx ON documents (household_id, expires_at) WHERE expires_at IS NOT NULL AND status <> 'deleted';
