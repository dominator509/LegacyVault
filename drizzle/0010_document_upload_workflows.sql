ALTER TABLE documents ADD COLUMN wrapped_data_key jsonb;
ALTER TABLE documents ADD COLUMN maximum_bytes bigint;
ALTER TABLE documents ADD COLUMN ciphertext_sha256 text;
ALTER TABLE documents ADD COLUMN uploaded_at timestamptz;
ALTER TABLE documents ADD COLUMN processed_at timestamptz;
ALTER TABLE documents ADD COLUMN last_error_class text;

ALTER TABLE documents ADD CONSTRAINT documents_maximum_bytes_valid
  CHECK (maximum_bytes IS NULL OR maximum_bytes BETWEEN 1 AND 104857600);
ALTER TABLE documents ADD CONSTRAINT documents_ciphertext_sha256_valid
  CHECK (ciphertext_sha256 IS NULL OR ciphertext_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE documents ADD CONSTRAINT documents_upload_state_valid
  CHECK (
    status = 'deleted'
    OR (
      wrapped_data_key IS NOT NULL
      AND maximum_bytes IS NOT NULL
      AND (
        (status = 'pending' AND ciphertext_sha256 IS NULL AND uploaded_at IS NULL)
        OR (status IN ('quarantined','clean','rejected') AND ciphertext_sha256 IS NOT NULL AND uploaded_at IS NOT NULL)
      )
    )
  ) NOT VALID;

COMMENT ON CONSTRAINT documents_upload_state_valid ON documents IS
  'Validated after legacy rows are backfilled; all new application writes satisfy this invariant.';
