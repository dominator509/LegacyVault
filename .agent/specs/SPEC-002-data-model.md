# Spec 002 Data Model

Every tenant table contains organization_id and household_id where applicable. Sensitive fields use encrypted envelopes. Facts include field_key, typed_value, status, source_type, source_id, confidence, sensitivity, confirmed_by, confirmed_at, last_reviewed_at, and version. Audit events form a hash chain. Deletion jobs track each system and processor.
