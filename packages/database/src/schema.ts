import {
  customType,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const tenant = {
  organizationId: uuid("organization_id").notNull(),
  householdId: uuid("household_id").notNull(),
};
const versioned = { version: integer("version").notNull().default(1) };

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
});
export const households = pgTable("households", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  name: text("name").notNull(),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  ...versioned,
});
export const householdKeys = pgTable("household_keys", {
  id: uuid("id").primaryKey(),
  ...tenant,
  keyVersion: integer("key_version").notNull(),
  wrappedKey: jsonb("wrapped_key").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
});
export const people = pgTable("people", {
  id: uuid("id").primaryKey(),
  ...tenant,
  displayNameEncrypted: bytea("display_name_encrypted").notNull(),
  keyVersion: integer("key_version").notNull(),
  ...versioned,
});
export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey(),
  ...tenant,
  personId: uuid("person_id").notNull(),
  role: text("role").notNull(),
  authUserId: text("auth_user_id"),
  active: integer("active").notNull().default(1),
  ...versioned,
});
export const permissionGrants = pgTable("permission_grants", {
  id: uuid("id").primaryKey(),
  ...tenant,
  membershipId: uuid("membership_id").notNull(),
  categories: jsonb("categories").notNull(),
  actions: jsonb("actions").notNull(),
  purpose: text("purpose").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...versioned,
});
export const supportAccessApprovals = pgTable("support_access_approvals", {
  id: uuid("id").primaryKey(),
  ...tenant,
  supportMembershipId: uuid("support_membership_id").notNull(),
  approvedByOwnerId: uuid("approved_by_owner_id").notNull(),
  reasonCode: text("reason_code").notNull(),
  categories: jsonb("categories").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...versioned,
});
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey(),
    ...tenant,
    objectKey: text("object_key").notNull(),
    originalSha256: text("original_sha256").notNull(),
    mediaType: text("media_type").notNull(),
    status: text("status").notNull(),
    encryptionKeyVersion: integer("encryption_key_version").notNull(),
    ...versioned,
  },
  (table) => [uniqueIndex("documents_object_key_unique").on(table.objectKey)],
);
export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey(),
  ...tenant,
  sourceType: text("source_type").notNull(),
  sourceId: uuid("source_id").notNull(),
  locator: text("locator").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  ...versioned,
});
export const facts = pgTable("facts", {
  id: uuid("id").primaryKey(),
  ...tenant,
  fieldKey: text("field_key").notNull(),
  typedValueEncrypted: bytea("typed_value_encrypted").notNull(),
  keyVersion: integer("key_version").notNull(),
  status: text("status").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: uuid("source_id").notNull(),
  evidenceIds: jsonb("evidence_ids").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  sensitivity: text("sensitivity").notNull(),
  confirmedBy: uuid("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  ...versioned,
});
export const consents = pgTable("consents", {
  id: uuid("id").primaryKey(),
  ...tenant,
  personId: uuid("person_id").notNull(),
  purpose: text("purpose").notNull(),
  policyVersion: text("policy_version").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  ...versioned,
});
export const emergencyAccessRequests = pgTable("emergency_access_requests", {
  id: uuid("id").primaryKey(),
  ...tenant,
  requesterId: uuid("requester_id").notNull(),
  recipientMembershipId: uuid("recipient_membership_id").notNull(),
  categories: jsonb("categories").notNull(),
  reasonEncrypted: bytea("reason_encrypted").notNull(),
  keyVersion: integer("key_version").notNull(),
  status: text("status").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  decisionAt: timestamp("decision_at", { withTimezone: true }),
  releaseAfter: timestamp("release_after", { withTimezone: true }),
  ...versioned,
});
export const reports = pgTable("reports", {
  id: uuid("id").primaryKey(),
  ...tenant,
  kind: text("kind").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
  claims: jsonb("claims").notNull(),
  sourceFactVersions: jsonb("source_fact_versions").notNull(),
  ...versioned,
});
export const exports = pgTable("exports", {
  id: uuid("id").primaryKey(),
  ...tenant,
  workflowId: uuid("workflow_id").notNull(),
  status: text("status").notNull(),
  wrappedExportKey: jsonb("wrapped_export_key").notNull(),
  encryptionKeyVersion: integer("encryption_key_version").notNull(),
  objectKey: text("object_key"),
  archiveSha256: text("archive_sha256"),
  signerPublicKey: text("signer_public_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...versioned,
});
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey(),
    ...tenant,
    kind: text("kind").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull(),
    completedSteps: jsonb("completed_steps").notNull(),
    nextStep: text("next_step"),
    lastErrorClass: text("last_error_class"),
    subjectType: text("subject_type"),
    subjectId: uuid("subject_id"),
    ...versioned,
  },
  (table) => [
    uniqueIndex("workflow_idempotency_unique").on(
      table.organizationId,
      table.householdId,
      table.idempotencyKey,
    ),
  ],
);
export const privacyRequests = pgTable("privacy_requests", {
  id: uuid("id").primaryKey(),
  ...tenant,
  personId: uuid("person_id").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  ...versioned,
});
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey(),
  ...tenant,
  status: text("status").notNull(),
  plan: text("plan").notNull(),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }),
  ...versioned,
});
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    ...tenant,
    sequence: integer("sequence").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    actorPseudonym: text("actor_pseudonym").notNull(),
    action: text("action").notNull(),
    outcome: text("outcome").notNull(),
    metadata: jsonb("metadata").notNull(),
    previousHash: text("previous_hash").notNull(),
    eventHash: text("event_hash").notNull(),
  },
  (table) => [
    uniqueIndex("audit_household_sequence_unique").on(
      table.householdId,
      table.sequence,
    ),
    uniqueIndex("audit_event_hash_unique").on(table.eventHash),
  ],
);

export const idempotencyRecords = pgTable("idempotency_records", {
  ...tenant,
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  statusCode: integer("status_code"),
  responseBody: jsonb("response_body"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").primaryKey(),
    ...tenant,
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    providerCreatedAt: timestamp("provider_created_at", {
      withTimezone: true,
    }).notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingErrorClass: text("processing_error_class"),
  },
  (table) => [
    uniqueIndex("billing_external_event_unique").on(table.externalEventId),
  ],
);

export const deletionProcessorRequests = pgTable(
  "deletion_processor_requests",
  {
    id: uuid("id").primaryKey(),
    ...tenant,
    workflowId: uuid("workflow_id").notNull(),
    processor: text("processor").notNull(),
    externalRequestId: text("external_request_id"),
    status: text("status").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("deletion_workflow_processor_unique").on(
      table.workflowId,
      table.processor,
    ),
  ],
);
