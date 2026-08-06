import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import type { ReportKind, Role } from "@legacy/domain";
import { createDatabasePool } from "./client.js";

export interface TenantContext {
  organizationId: string;
  householdId: string;
  actorId: string;
}
export interface AccountContext {
  authUserId: string;
}
export interface HouseholdMembershipSummary {
  id: string;
  organizationId: string;
  name: string;
  version: number;
  membershipId: string;
  role: Role;
}
export interface EncryptedHouseholdMember {
  id: string;
  personId: string;
  role: Role;
  active: boolean;
  version: number;
  displayNameCiphertext: Uint8Array;
  keyVersion: number;
}
export interface MembershipInvitationAcceptanceContext {
  id: string;
  organizationId: string;
  householdId: string;
  role: Role;
  version: number;
  expiresAt: string;
}
export interface CandidateFactWrite {
  id: string;
  fieldKey: string;
  ciphertext: Uint8Array;
  keyVersion: number;
  sourceType: string;
  sourceId: string;
  evidenceIds: readonly string[];
  confidence?: number;
  sensitivity: string;
}

export interface PersistedWorkflow {
  id: string;
  kind: string;
  status: string;
  completedSteps: string[];
  nextStep: string | null;
  version: number;
}

export interface NormalizedBillingEvent {
  externalEventId: string;
  eventType: string;
  providerCreatedAt: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  status: string;
  plan: string;
}

export interface SubscriptionReadModel {
  status:
    | "inactive"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "paused";
  plan: string | null;
  providerUpdatedAt: string | null;
  version: number;
}
export type PrivacyRequestKind =
  "access" | "correction" | "export" | "deletion" | "appeal";

export interface StartedPortableExport {
  export: { id: string; status: string; version: number };
  workflow: { id: string; status: string; version: number };
}

export interface PortableExportReadModel {
  id: string;
  status: string;
  objectKey: string | null;
  archiveSha256: string | null;
  signerPublicKey: string | null;
  createdAt: string;
  completedAt: string | null;
  version: number;
}
export interface PortableExportBuildInput {
  exportId: string;
  workflowId: string;
  status: string;
  createdAt: string;
  wrappedExportKey: unknown;
  encryptionKeyVersion: number;
  snapshot: unknown;
  documents: readonly {
    id: string;
    objectKey: string;
    mediaType: string;
    encryptionKeyVersion: number;
  }[];
}
export interface EncryptedFactForReport {
  id: string;
  fieldKey: string;
  ciphertext: Uint8Array;
  keyVersion: number;
  sourceType: string;
  sourceId: string;
  evidenceIds: string[];
  confidence?: number;
  sensitivity: string;
  status: "candidate" | "confirmed" | "rejected" | "disputed";
  confirmedBy?: string;
  confirmedAt?: string;
  lastReviewedAt?: string;
  version: number;
}
export interface VaultDocumentSummary {
  id: string;
  mediaType: string;
  status: string;
  expiresAt?: string;
  uploadedAt?: string;
  processedAt?: string;
  deleteOriginalAfterProcessing: boolean;
  originalDeletedAt?: string;
  version: number;
}
export interface StartedReport {
  report: { id: string; kind: ReportKind; status: "pending"; version: number };
  workflow: { id: string; status: "pending"; version: number };
}
export interface ReportBuildInput {
  reportId: string;
  workflowId: string;
  kind: ReportKind;
  status: string;
  requestedAt: string;
  facts: EncryptedFactForReport[];
  documents: readonly { id: string; expiresAt?: string }[];
}
export interface EncryptedReportRecord {
  id: string;
  kind: ReportKind;
  status: "pending" | "completed" | "failed";
  generatedAt: string;
  payloadEncrypted?: Uint8Array;
  encryptionKeyVersion?: number;
  version: number;
}
export interface NotificationDeliveryInput {
  deliveryId: string;
  reportId: string;
  kind: "annual-review-ready";
  recipientEmail: string;
  status: "pending" | "sent" | "failed";
  providerMessageId?: string;
}
export interface DocumentUploadRecord {
  id: string;
  objectKey: string;
  originalSha256: string;
  mediaType: string;
  status: string;
  encryptionKeyVersion: number;
  wrappedDataKey: unknown;
  maximumBytes: number;
  version: number;
  deleteOriginalAfterProcessing: boolean;
  originalDeletedAt: string | null;
}
export interface StartedDocumentProcessing {
  document: { id: string; status: string; version: number };
  workflow: { id: string; status: string; version: number };
}
export interface ManualDocumentCandidateWrite extends CandidateFactWrite {
  evidenceId: string;
  locator: string;
}
export interface DocumentProcessingInput extends DocumentUploadRecord {
  workflowId: string;
  workflowStatus: string;
  workflowVersion: number;
  nextStep: string | null;
}

export interface ConfirmedPrivacyDeletion {
  privacyRequest: {
    id: string;
    status: "recovery-period";
    version: number;
    recoveryUntil: string;
  };
  execution: { id: string; status: "recovery-period"; version: number };
  workflow: { id: string; status: string; version: number };
}

export interface CancelledPrivacyDeletion {
  privacyRequest: { id: string; status: "cancelled"; version: number };
  execution: { id: string; status: "cancelled"; version: number };
  workflow: { id: string; status: "completed"; version: number };
}

export interface PrivacyDeletionInput {
  executionId: string;
  privacyRequestId: string;
  workflowId: string;
  personId: string;
  status: string;
  recoveryUntil: string;
  version: number;
  legalHoldCategories: string[];
}

export interface PrivacyDeletionProgress {
  executionId: string;
  status: "awaiting-review" | "blocked-legal-hold";
  backupExpiresAt?: string;
  legalHoldCategories: string[];
}

export class VaultRepository {
  readonly #pool: pg.Pool;
  constructor(databaseUrl: string) {
    this.#pool = createDatabasePool(databaseUrl);
  }
  async close(): Promise<void> {
    await this.#pool.end();
  }

  async withTenant<T>(
    context: TenantContext,
    operation: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id', $1, true), set_config('app.household_id', $2, true)",
        [context.organizationId, context.householdId],
      );
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async withAccount<T>(
    context: AccountContext,
    operation: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.auth_user_id', $1, true)", [
        context.authUserId,
      ]);
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async createHouseholdForAccount(
    context: AccountContext,
    input: {
      idempotencyKey: string;
      expectedVersion: 0;
      organizationId: string;
      organizationName: string;
      householdId: string;
      householdName: string;
      personId: string;
      membershipId: string;
      displayNameCiphertext: Uint8Array;
      keyVersion: number;
      householdKeyId: string;
      wrappedHouseholdKey: unknown;
    },
  ): Promise<{
    household: { id: string; name: string; version: number };
    membership: { id: string; role: "Owner"; version: number };
  }> {
    return this.withAccount(context, async (client) => {
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            organizationName: input.organizationName,
            householdName: input.householdName,
            expectedVersion: input.expectedVersion,
          }),
        )
        .digest("hex");
      const inserted = await client.query(
        "insert into account_idempotency_records(auth_user_id,idempotency_key,request_hash,expires_at) values ($1,$2,$3,now()+interval '24 hours') on conflict do nothing",
        [context.authUserId, input.idempotencyKey, requestHash],
      );
      if (inserted.rowCount === 0) {
        const existing = await client.query<{
          request_hash: string;
          response_body: unknown;
        }>(
          "select request_hash,response_body from account_idempotency_records where auth_user_id=$1 and idempotency_key=$2",
          [context.authUserId, input.idempotencyKey],
        );
        const row = existing.rows[0];
        if (!row || row.request_hash !== requestHash)
          throw new Error("account idempotency key conflict");
        if (!row.response_body)
          throw new Error("household creation is still processing");
        return row.response_body as {
          household: { id: string; name: string; version: number };
          membership: { id: string; role: "Owner"; version: number };
        };
      }
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [input.organizationId, input.householdId],
      );
      await client.query("insert into organizations(id,name) values ($1,$2)", [
        input.organizationId,
        input.organizationName,
      ]);
      const household = await client.query<{
        id: string;
        name: string;
        version: number;
      }>(
        "insert into households(id,organization_id,name) values ($1,$2,$3) returning id,name,version",
        [input.householdId, input.organizationId, input.householdName],
      );
      await client.query(
        "insert into household_keys(id,organization_id,household_id,key_version,wrapped_key,status,created_at) values ($1,$2,$3,$4,$5,'active',now())",
        [
          input.householdKeyId,
          input.organizationId,
          input.householdId,
          input.keyVersion,
          JSON.stringify(input.wrappedHouseholdKey),
        ],
      );
      await client.query(
        "insert into people(id,organization_id,household_id,display_name_encrypted,key_version) values ($1,$2,$3,$4,$5)",
        [
          input.personId,
          input.organizationId,
          input.householdId,
          Buffer.from(input.displayNameCiphertext),
          input.keyVersion,
        ],
      );
      const membership = await client.query<{
        id: string;
        role: "Owner";
        version: number;
      }>(
        "insert into memberships(id,organization_id,household_id,person_id,role,auth_user_id) values ($1,$2,$3,$4,'Owner',$5) returning id,role,version",
        [
          input.membershipId,
          input.organizationId,
          input.householdId,
          input.personId,
          context.authUserId,
        ],
      );
      const householdRow = household.rows[0];
      const membershipRow = membership.rows[0];
      if (!householdRow || !membershipRow)
        throw new Error("household creation returned no row");
      const response = {
        household: householdRow,
        membership: membershipRow,
      };
      await client.query(
        "update account_idempotency_records set response_body=$1 where auth_user_id=$2 and idempotency_key=$3",
        [JSON.stringify(response), context.authUserId, input.idempotencyKey],
      );
      return response;
    });
  }

  async listHouseholdsForAccount(
    context: AccountContext,
  ): Promise<HouseholdMembershipSummary[]> {
    return this.withAccount(context, async (client) => {
      const result = await client.query<{
        id: string;
        organization_id: string;
        name: string;
        version: number;
        membership_id: string;
        role: Role;
      }>(
        "select h.id,h.organization_id,h.name,h.version,m.id as membership_id,m.role from memberships m join households h on h.id=m.household_id and h.organization_id=m.organization_id where m.auth_user_id=$1 and m.active=1 order by h.name,h.id",
        [context.authUserId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        name: row.name,
        version: row.version,
        membershipId: row.membership_id,
        role: row.role,
      }));
    });
  }

  async listHouseholdMembers(
    context: TenantContext,
  ): Promise<EncryptedHouseholdMember[]> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        person_id: string;
        role: Role;
        active: number;
        version: number;
        display_name_encrypted: Buffer;
        key_version: number;
      }>(
        "select m.id,m.person_id,m.role,m.active,m.version,p.display_name_encrypted,p.key_version from memberships m join people p on p.id=m.person_id order by m.id",
      );
      return result.rows.map((row) => ({
        id: row.id,
        personId: row.person_id,
        role: row.role,
        active: row.active === 1,
        version: row.version,
        displayNameCiphertext: row.display_name_encrypted,
        keyVersion: row.key_version,
      }));
    });
  }

  async createMembershipInvitation(
    context: TenantContext,
    input: {
      idempotencyKey: string;
      expectedHouseholdVersion: number;
      invitationId: string;
      emailHash: string;
      tokenHash: string;
      role: Role;
      invitedBy: string;
      expiresAt: string;
    },
  ): Promise<{
    invitation: { id: string; role: Role; expiresAt: string; version: number };
    householdVersion: number;
  }> {
    return this.withTenant(context, async (client) => {
      const requestShape = {
        emailHash: input.emailHash,
        role: input.role,
        expectedHouseholdVersion: input.expectedHouseholdVersion,
      };
      const requestHash = createHash("sha256")
        .update(JSON.stringify(requestShape))
        .digest("hex");
      const reserved = await client.query(
        "insert into idempotency_records(organization_id,household_id,idempotency_key,request_hash,expires_at) values ($1,$2,$3,$4,now()+interval '24 hours') on conflict do nothing",
        [
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
          requestHash,
        ],
      );
      if (reserved.rowCount === 0) {
        const existing = await client.query<{
          request_hash: string;
          response_body: unknown;
        }>(
          "select request_hash,response_body from idempotency_records where organization_id=$1 and household_id=$2 and idempotency_key=$3",
          [context.organizationId, context.householdId, input.idempotencyKey],
        );
        const row = existing.rows[0];
        if (!row || row.request_hash !== requestHash)
          throw new Error("membership invitation idempotency conflict");
        if (!row.response_body)
          throw new Error("membership invitation is still processing");
        return row.response_body as {
          invitation: {
            id: string;
            role: Role;
            expiresAt: string;
            version: number;
          };
          householdVersion: number;
        };
      }
      const household = await client.query<{ version: number }>(
        "update households set version=version+1 where id=$1 and version=$2 returning version",
        [context.householdId, input.expectedHouseholdVersion],
      );
      const householdVersion = household.rows[0]?.version;
      if (!householdVersion)
        throw new Error("membership invitation version conflict");
      let invitation;
      try {
        invitation = await client.query<{
          id: string;
          role: Role;
          expires_at: Date;
          version: number;
        }>(
          "insert into membership_invitations(id,organization_id,household_id,email_hash,token_hash,role,invited_by,expires_at) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id,role,expires_at,version",
          [
            input.invitationId,
            context.organizationId,
            context.householdId,
            input.emailHash,
            input.tokenHash,
            input.role,
            input.invitedBy,
            input.expiresAt,
          ],
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505"
        )
          throw new Error("membership invitation conflict");
        throw error;
      }
      const row = invitation.rows[0];
      if (!row) throw new Error("membership invitation returned no row");
      const response = {
        invitation: {
          id: row.id,
          role: row.role,
          expiresAt: row.expires_at.toISOString(),
          version: row.version,
        },
        householdVersion,
      };
      await client.query(
        "update idempotency_records set status_code=201,response_body=$1 where organization_id=$2 and household_id=$3 and idempotency_key=$4",
        [
          JSON.stringify(response),
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
        ],
      );
      return response;
    });
  }

  async getMembershipInvitationForAcceptance(
    context: AccountContext,
    input: { tokenHash: string; emailHash: string; now: string },
  ): Promise<MembershipInvitationAcceptanceContext | null> {
    return this.withAccount(context, async (client) => {
      await client.query(
        "select set_config('app.invitation_token_hash',$1,true)",
        [input.tokenHash],
      );
      const result = await client.query<{
        id: string;
        organization_id: string;
        household_id: string;
        email_hash: string;
        role: Role;
        version: number;
        expires_at: Date;
        accepted_at: Date | null;
        accepted_by_auth_user_id: string | null;
        revoked_at: Date | null;
      }>(
        "select id,organization_id,household_id,email_hash,role,version,expires_at,accepted_at,accepted_by_auth_user_id,revoked_at from membership_invitations where token_hash=$1",
        [input.tokenHash],
      );
      const row = result.rows[0];
      const acceptedByThisAccount =
        row?.accepted_at !== null &&
        row?.accepted_by_auth_user_id === context.authUserId;
      if (
        !row ||
        row.email_hash !== input.emailHash ||
        row.revoked_at ||
        (!acceptedByThisAccount &&
          (row.accepted_at ||
            row.expires_at.getTime() <= Date.parse(input.now)))
      )
        return null;
      return {
        id: row.id,
        organizationId: row.organization_id,
        householdId: row.household_id,
        role: row.role,
        version: row.version,
        expiresAt: row.expires_at.toISOString(),
      };
    });
  }

  async acceptMembershipInvitation(
    context: AccountContext,
    input: {
      idempotencyKey: string;
      tokenHash: string;
      emailHash: string;
      displayNameHash: string;
      expectedInvitationVersion: number;
      personId: string;
      membershipId: string;
      displayNameCiphertext: Uint8Array;
      keyVersion: number;
      acceptedAt: string;
    },
  ): Promise<{
    household: { id: string; name: string; version: number };
    membership: { id: string; role: Role; version: number };
  }> {
    return this.withAccount(context, async (client) => {
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            tokenHash: input.tokenHash,
            emailHash: input.emailHash,
            displayNameHash: input.displayNameHash,
            expectedInvitationVersion: input.expectedInvitationVersion,
          }),
        )
        .digest("hex");
      const reserved = await client.query(
        "insert into account_idempotency_records(auth_user_id,idempotency_key,request_hash,expires_at) values ($1,$2,$3,now()+interval '24 hours') on conflict do nothing",
        [context.authUserId, input.idempotencyKey, requestHash],
      );
      if (reserved.rowCount === 0) {
        const existing = await client.query<{
          request_hash: string;
          response_body: unknown;
        }>(
          "select request_hash,response_body from account_idempotency_records where auth_user_id=$1 and idempotency_key=$2",
          [context.authUserId, input.idempotencyKey],
        );
        const row = existing.rows[0];
        if (!row || row.request_hash !== requestHash)
          throw new Error("invitation acceptance idempotency conflict");
        if (!row.response_body)
          throw new Error("invitation acceptance is still processing");
        return row.response_body as {
          household: { id: string; name: string; version: number };
          membership: { id: string; role: Role; version: number };
        };
      }
      await client.query(
        "select set_config('app.invitation_token_hash',$1,true)",
        [input.tokenHash],
      );
      type InvitationAcceptanceRow = {
        id: string;
        organization_id: string;
        household_id: string;
        email_hash: string;
        role: Role;
        version: number;
        expires_at: Date;
        accepted_at: Date | null;
        revoked_at: Date | null;
      };
      const visibleInvitation = await client.query<InvitationAcceptanceRow>(
        "select id,organization_id,household_id,email_hash,role,version,expires_at,accepted_at,revoked_at from membership_invitations where token_hash=$1",
        [input.tokenHash],
      );
      const visibleRow = visibleInvitation.rows[0];
      if (
        !visibleRow ||
        visibleRow.email_hash !== input.emailHash ||
        visibleRow.accepted_at ||
        visibleRow.revoked_at ||
        visibleRow.expires_at.getTime() <= Date.parse(input.acceptedAt)
      )
        throw new Error("membership invitation unavailable");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [visibleRow.organization_id, visibleRow.household_id],
      );
      const lockedInvitation = await client.query<InvitationAcceptanceRow>(
        "select id,organization_id,household_id,email_hash,role,version,expires_at,accepted_at,revoked_at from membership_invitations where id=$1 for update",
        [visibleRow.id],
      );
      const invitationRow = lockedInvitation.rows[0];
      if (
        !invitationRow ||
        invitationRow.email_hash !== input.emailHash ||
        invitationRow.accepted_at ||
        invitationRow.revoked_at ||
        invitationRow.expires_at.getTime() <= Date.parse(input.acceptedAt)
      )
        throw new Error("membership invitation unavailable");
      if (invitationRow.version !== input.expectedInvitationVersion)
        throw new Error("membership invitation version conflict");
      await client.query(
        "insert into people(id,organization_id,household_id,display_name_encrypted,key_version) values ($1,$2,$3,$4,$5)",
        [
          input.personId,
          invitationRow.organization_id,
          invitationRow.household_id,
          Buffer.from(input.displayNameCiphertext),
          input.keyVersion,
        ],
      );
      const membership = await client.query<{
        id: string;
        role: Role;
        version: number;
      }>(
        "insert into memberships(id,organization_id,household_id,person_id,role,auth_user_id) values ($1,$2,$3,$4,$5,$6) returning id,role,version",
        [
          input.membershipId,
          invitationRow.organization_id,
          invitationRow.household_id,
          input.personId,
          invitationRow.role,
          context.authUserId,
        ],
      );
      const accepted = await client.query(
        "update membership_invitations set accepted_at=$1,accepted_by_auth_user_id=$2,version=version+1 where id=$3 and version=$4 and accepted_at is null and revoked_at is null",
        [
          input.acceptedAt,
          context.authUserId,
          invitationRow.id,
          input.expectedInvitationVersion,
        ],
      );
      if (accepted.rowCount !== 1)
        throw new Error("membership invitation version conflict");
      const household = await client.query<{
        id: string;
        name: string;
        version: number;
      }>(
        "update households set version=version+1 where id=$1 returning id,name,version",
        [invitationRow.household_id],
      );
      const householdRow = household.rows[0];
      const membershipRow = membership.rows[0];
      if (!householdRow || !membershipRow)
        throw new Error("membership acceptance returned no row");
      const response = {
        household: householdRow,
        membership: membershipRow,
      };
      await client.query(
        "update account_idempotency_records set response_body=$1 where auth_user_id=$2 and idempotency_key=$3",
        [JSON.stringify(response), context.authUserId, input.idempotencyKey],
      );
      return response;
    });
  }

  async createCandidateFact(
    context: TenantContext,
    input: CandidateFactWrite,
  ): Promise<{ id: string; status: "candidate"; version: number }> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        status: "candidate";
        version: number;
      }>(
        "insert into facts(id, organization_id, household_id, field_key, typed_value_encrypted, key_version, status, source_type, source_id, evidence_ids, confidence, sensitivity) values ($1,$2,$3,$4,$5,$6,'candidate',$7,$8,$9,$10,$11) returning id,status,version",
        [
          input.id,
          context.organizationId,
          context.householdId,
          input.fieldKey,
          Buffer.from(input.ciphertext),
          input.keyVersion,
          input.sourceType,
          input.sourceId,
          JSON.stringify(input.evidenceIds),
          input.confidence ?? null,
          input.sensitivity,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("candidate fact insert returned no row");
      return row;
    });
  }

  async confirmFact(
    context: TenantContext,
    factId: string,
    expectedVersion: number,
    confirmedAt: string,
  ): Promise<{ id: string; status: "confirmed"; version: number }> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        status: "confirmed";
        version: number;
      }>(
        "update facts set status='confirmed', confirmed_by=$1, confirmed_at=$2, version=version+1 where id=$3 and version=$4 and status in ('candidate','disputed') and (source_type='manual' or jsonb_array_length(evidence_ids)>0) returning id,status,version",
        [context.actorId, confirmedAt, factId, expectedVersion],
      );
      const row = result.rows[0];
      if (!row) throw new Error("fact confirmation conflict or policy denial");
      return row;
    });
  }

  async rejectFact(
    context: TenantContext,
    factId: string,
    expectedVersion: number,
  ): Promise<{ id: string; status: "rejected"; version: number }> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        status: "rejected";
        version: number;
      }>(
        "update facts set status='rejected',version=version+1 where id=$1 and version=$2 and status='candidate' returning id,status,version",
        [factId, expectedVersion],
      );
      const row = result.rows[0];
      if (!row) throw new Error("fact rejection conflict or policy denial");
      return row;
    });
  }

  async disputeFact(
    context: TenantContext,
    factId: string,
    expectedVersion: number,
  ): Promise<{ id: string; status: "disputed"; version: number }> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        status: "disputed";
        version: number;
      }>(
        "update facts set status='disputed',confirmed_by=null,confirmed_at=null,version=version+1 where id=$1 and version=$2 and status='confirmed' returning id,status,version",
        [factId, expectedVersion],
      );
      const row = result.rows[0];
      if (!row) throw new Error("fact dispute conflict or policy denial");
      return row;
    });
  }

  async getFactFieldKey(
    context: TenantContext,
    factId: string,
  ): Promise<string> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{ field_key: string }>(
        "select field_key from facts where id=$1",
        [factId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("fact unavailable");
      return row.field_key;
    });
  }

  async listVaultFacts(
    context: TenantContext,
    categories: readonly string[],
  ): Promise<EncryptedFactForReport[]> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        field_key: string;
        typed_value_encrypted: Buffer;
        key_version: number;
        status: EncryptedFactForReport["status"];
        source_type: string;
        source_id: string;
        evidence_ids: string[];
        confidence: string | null;
        sensitivity: string;
        confirmed_by: string | null;
        confirmed_at: Date | null;
        last_reviewed_at: Date | null;
        version: number;
      }>(
        "select id,field_key,typed_value_encrypted,key_version,status,source_type,source_id,evidence_ids,confidence,sensitivity,confirmed_by,confirmed_at,last_reviewed_at,version from facts where status<>'rejected' and split_part(field_key,'.',1)=any($1::text[]) order by field_key,id",
        [categories],
      );
      return result.rows.map((fact) => ({
        id: fact.id,
        fieldKey: fact.field_key,
        ciphertext: new Uint8Array(fact.typed_value_encrypted),
        keyVersion: fact.key_version,
        status: fact.status,
        sourceType: fact.source_type,
        sourceId: fact.source_id,
        evidenceIds: fact.evidence_ids,
        ...(fact.confidence === null
          ? {}
          : { confidence: Number(fact.confidence) }),
        sensitivity: fact.sensitivity,
        ...(fact.confirmed_by ? { confirmedBy: fact.confirmed_by } : {}),
        ...(fact.confirmed_at
          ? { confirmedAt: fact.confirmed_at.toISOString() }
          : {}),
        ...(fact.last_reviewed_at
          ? { lastReviewedAt: fact.last_reviewed_at.toISOString() }
          : {}),
        version: fact.version,
      }));
    });
  }

  async listVaultDocuments(
    context: TenantContext,
  ): Promise<VaultDocumentSummary[]> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        media_type: string;
        status: string;
        expires_at: Date | null;
        uploaded_at: Date | null;
        processed_at: Date | null;
        delete_original_after_processing: boolean;
        original_deleted_at: Date | null;
        version: number;
      }>(
        "select id,media_type,status,expires_at,uploaded_at,processed_at,delete_original_after_processing,original_deleted_at,version from documents where status<>'deleted' order by uploaded_at desc nulls last,id",
      );
      return result.rows.map((document) => ({
        id: document.id,
        mediaType: document.media_type,
        status: document.status,
        ...(document.expires_at
          ? { expiresAt: document.expires_at.toISOString() }
          : {}),
        ...(document.uploaded_at
          ? { uploadedAt: document.uploaded_at.toISOString() }
          : {}),
        ...(document.processed_at
          ? { processedAt: document.processed_at.toISOString() }
          : {}),
        deleteOriginalAfterProcessing:
          document.delete_original_after_processing,
        ...(document.original_deleted_at
          ? { originalDeletedAt: document.original_deleted_at.toISOString() }
          : {}),
        version: document.version,
      }));
    });
  }

  async createEmergencyAccessRequest(
    context: TenantContext,
    input: {
      id: string;
      recipientMembershipId: string;
      categories: readonly string[];
      reasonEncrypted: Uint8Array;
      keyVersion: number;
      requestedAt: string;
    },
  ): Promise<{ id: string; status: "requested"; version: number }> {
    return this.withTenant(context, async (client) => {
      const recipient = await client.query(
        "select 1 from memberships where id=$1 and person_id=$2 and active=1 and role='EmergencyRecipient'",
        [input.recipientMembershipId, context.actorId],
      );
      if (recipient.rowCount !== 1)
        throw new Error("emergency recipient membership is invalid");
      const result = await client.query<{
        id: string;
        status: "requested";
        version: number;
      }>(
        "insert into emergency_access_requests(id,organization_id,household_id,requester_id,recipient_membership_id,categories,reason_encrypted,key_version,status,requested_at) values ($1,$2,$3,$4,$5,$6,$7,$8,'requested',$9) returning id,status,version",
        [
          input.id,
          context.organizationId,
          context.householdId,
          context.actorId,
          input.recipientMembershipId,
          JSON.stringify(input.categories),
          Buffer.from(input.reasonEncrypted),
          input.keyVersion,
          input.requestedAt,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("emergency request was not persisted");
      return row;
    });
  }

  async getEmergencyAccessCategories(
    context: TenantContext,
    requestId: string,
  ): Promise<string[]> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{ categories: string[] }>(
        "select categories from emergency_access_requests where id=$1",
        [requestId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("emergency access request is unavailable");
      return row.categories;
    });
  }

  async decideEmergencyAccess(
    context: TenantContext,
    input: {
      requestId: string;
      expectedVersion: number;
      decision: "deny" | "delay";
      decisionAt: string;
      releaseAfter?: string;
    },
  ): Promise<{ id: string; status: "denied" | "delayed"; version: number }> {
    return this.withTenant(context, async (client) => {
      const status = input.decision === "deny" ? "denied" : "delayed";
      const result = await client.query<{
        id: string;
        status: "denied" | "delayed";
        version: number;
      }>(
        "update emergency_access_requests set status=$1,decision_at=$2,release_after=$3,version=version+1 where id=$4 and version=$5 and status='requested' returning id,status,version",
        [
          status,
          input.decisionAt,
          input.releaseAfter ?? null,
          input.requestId,
          input.expectedVersion,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("emergency access decision conflict");
      return row;
    });
  }

  async releaseEmergencyAccess(
    context: TenantContext,
    input: { requestId: string; expectedVersion: number; releasedAt: string },
  ): Promise<{ id: string; status: "released"; version: number }> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        status: "released";
        version: number;
      }>(
        "update emergency_access_requests set status='released',version=version+1 where id=$1 and version=$2 and status='delayed' and release_after<=$3 returning id,status,version",
        [input.requestId, input.expectedVersion, input.releasedAt],
      );
      const row = result.rows[0];
      if (!row)
        throw new Error("emergency access release conflict or delay active");
      return row;
    });
  }

  async startReport(
    context: TenantContext,
    input: {
      idempotencyKey: string;
      kind: ReportKind;
      requestedAt: string;
    },
  ): Promise<StartedReport> {
    return this.withTenant(context, async (client) => {
      const reportId = randomUUID();
      const workflowId = randomUUID();
      const reportResult = await client.query<{
        id: string;
        kind: ReportKind;
        status: "pending";
        version: number;
      }>(
        "insert into reports(id,organization_id,household_id,kind,workflow_id,requested_by,status,generated_at,claims,source_fact_versions) values ($1,$2,$3,$4,$5,$6,'pending',$7,'[]','{}') returning id,kind,status,version",
        [
          reportId,
          context.organizationId,
          context.householdId,
          input.kind,
          workflowId,
          context.actorId,
          input.requestedAt,
        ],
      );
      const workflowResult = await client.query<{
        id: string;
        status: "pending";
        version: number;
      }>(
        "insert into workflow_runs(id,organization_id,household_id,kind,idempotency_key,status,completed_steps,next_step,subject_type,subject_id) values ($1,$2,$3,$4,$5,'pending','[]','collect','Report',$6) returning id,status,version",
        [
          workflowId,
          context.organizationId,
          context.householdId,
          input.kind === "annual-review" ? "annual-review" : "report",
          `report:${input.idempotencyKey}`,
          reportId,
        ],
      );
      const report = reportResult.rows[0];
      const workflow = workflowResult.rows[0];
      if (!report || !workflow)
        throw new Error("report workflow was not persisted");
      return { report, workflow };
    });
  }

  async getReportBuildInput(
    context: TenantContext,
    workflowId: string,
  ): Promise<ReportBuildInput> {
    return this.withTenant(context, async (client) => {
      const reportResult = await client.query<{
        id: string;
        workflow_id: string;
        kind: ReportKind;
        status: string;
        generated_at: Date;
      }>(
        "select r.id,r.workflow_id,r.kind,r.status,r.generated_at from reports r join workflow_runs w on w.id=r.workflow_id where r.workflow_id=$1 and w.subject_type='Report' and w.subject_id=r.id",
        [workflowId],
      );
      const report = reportResult.rows[0];
      if (!report) throw new Error("report workflow is unavailable");
      const factResult = await client.query<{
        id: string;
        field_key: string;
        typed_value_encrypted: Buffer;
        key_version: number;
        status: EncryptedFactForReport["status"];
        source_type: string;
        source_id: string;
        evidence_ids: string[];
        confidence: string | null;
        sensitivity: string;
        confirmed_by: string | null;
        confirmed_at: Date | null;
        last_reviewed_at: Date | null;
        version: number;
      }>(
        "select id,field_key,typed_value_encrypted,key_version,status,source_type,source_id,evidence_ids,confidence,sensitivity,confirmed_by,confirmed_at,last_reviewed_at,version from facts where status<>'rejected' order by field_key,id",
      );
      const documentResult = await client.query<{
        id: string;
        expires_at: Date | null;
      }>(
        "select id,expires_at from documents where status<>'deleted' order by id",
      );
      return {
        reportId: report.id,
        workflowId: report.workflow_id,
        kind: report.kind,
        status: report.status,
        requestedAt: report.generated_at.toISOString(),
        facts: factResult.rows.map((fact) => ({
          id: fact.id,
          fieldKey: fact.field_key,
          ciphertext: new Uint8Array(fact.typed_value_encrypted),
          keyVersion: fact.key_version,
          status: fact.status,
          sourceType: fact.source_type,
          sourceId: fact.source_id,
          evidenceIds: fact.evidence_ids,
          ...(fact.confidence === null
            ? {}
            : { confidence: Number(fact.confidence) }),
          sensitivity: fact.sensitivity,
          ...(fact.confirmed_by ? { confirmedBy: fact.confirmed_by } : {}),
          ...(fact.confirmed_at
            ? { confirmedAt: fact.confirmed_at.toISOString() }
            : {}),
          ...(fact.last_reviewed_at
            ? { lastReviewedAt: fact.last_reviewed_at.toISOString() }
            : {}),
          version: fact.version,
        })),
        documents: documentResult.rows.map((document) => ({
          id: document.id,
          ...(document.expires_at
            ? { expiresAt: document.expires_at.toISOString() }
            : {}),
        })),
      };
    });
  }

  async getReport(
    context: TenantContext,
    reportId: string,
  ): Promise<EncryptedReportRecord | null> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        kind: ReportKind;
        status: EncryptedReportRecord["status"];
        generated_at: Date;
        payload_encrypted: Buffer | null;
        encryption_key_version: number | null;
        version: number;
      }>(
        "select id,kind,status,generated_at,payload_encrypted,encryption_key_version,version from reports where id=$1",
        [reportId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        generatedAt: row.generated_at.toISOString(),
        ...(row.payload_encrypted
          ? { payloadEncrypted: new Uint8Array(row.payload_encrypted) }
          : {}),
        ...(row.encryption_key_version === null
          ? {}
          : { encryptionKeyVersion: row.encryption_key_version }),
        version: row.version,
      };
    });
  }

  async completeReport(
    context: TenantContext,
    input: {
      reportId: string;
      workflowId: string;
      generatedAt: string;
      payloadEncrypted: Uint8Array;
      encryptionKeyVersion: number;
    },
  ): Promise<void> {
    await this.withTenant(context, async (client) => {
      const report = await client.query(
        "update reports set status='completed',generated_at=$1,completed_at=$1,payload_encrypted=$2,encryption_key_version=$3,version=version+1 where id=$4 and workflow_id=$5 and status='pending'",
        [
          input.generatedAt,
          Buffer.from(input.payloadEncrypted),
          input.encryptionKeyVersion,
          input.reportId,
          input.workflowId,
        ],
      );
      if (report.rowCount !== 1) {
        const existing = await client.query(
          "select 1 from reports where id=$1 and workflow_id=$2 and status='completed'",
          [input.reportId, input.workflowId],
        );
        if (existing.rowCount !== 1)
          throw new Error("report completion conflict");
      }
      await client.query(
        "update workflow_runs set status='completed',completed_steps='[\"collect\",\"generate\",\"store\"]',next_step=null,last_error_class=null,version=version+1 where id=$1 and status<>'completed'",
        [input.workflowId],
      );
    });
  }

  async getNotificationDeliveryInput(
    context: TenantContext,
    workflowId: string,
  ): Promise<NotificationDeliveryInput | null> {
    return this.withTenant(context, async (client) => {
      const eligible = await client.query<{
        report_id: string;
        person_id: string;
        email: string;
      }>(
        `select r.id as report_id,r.requested_by as person_id,u.email
         from reports r
         join memberships m on m.person_id=r.requested_by and m.active=1 and m.auth_user_id is not null
         join "user" u on u.id=m.auth_user_id and u."emailVerified"=true
         join consents c on c.person_id=r.requested_by and c.purpose='transactional-email' and c.withdrawn_at is null
         where r.workflow_id=$1 and r.kind='annual-review' and r.status='completed'
         order by c.granted_at desc
         limit 1`,
        [workflowId],
      );
      const recipient = eligible.rows[0];
      if (!recipient) return null;
      const deliveryId = randomUUID();
      const delivery = await client.query<{
        id: string;
        status: NotificationDeliveryInput["status"];
        provider_message_id: string | null;
      }>(
        `insert into notification_deliveries(id,organization_id,household_id,workflow_id,recipient_person_id,kind,status,created_at)
         values ($1,$2,$3,$4,$5,'annual-review-ready','pending',now())
         on conflict (workflow_id,recipient_person_id,kind) do update set workflow_id=excluded.workflow_id
         returning id,status,provider_message_id`,
        [
          deliveryId,
          context.organizationId,
          context.householdId,
          workflowId,
          recipient.person_id,
        ],
      );
      const row = delivery.rows[0];
      if (!row) throw new Error("notification delivery was not reserved");
      return {
        deliveryId: row.id,
        reportId: recipient.report_id,
        kind: "annual-review-ready",
        recipientEmail: recipient.email,
        status: row.status,
        ...(row.provider_message_id
          ? { providerMessageId: row.provider_message_id }
          : {}),
      };
    });
  }

  async completeNotificationDelivery(
    context: TenantContext,
    input: {
      deliveryId: string;
      providerMessageId: string;
      sentAt: string;
    },
  ): Promise<void> {
    await this.withTenant(context, async (client) => {
      const result = await client.query(
        "update notification_deliveries set status='sent',provider_message_id=$1,sent_at=$2,last_error_class=null,attempt_count=attempt_count+1,version=version+1 where id=$3 and status<>'sent'",
        [input.providerMessageId, input.sentAt, input.deliveryId],
      );
      if (result.rowCount !== 1) {
        const existing = await client.query(
          "select 1 from notification_deliveries where id=$1 and status='sent' and provider_message_id=$2",
          [input.deliveryId, input.providerMessageId],
        );
        if (existing.rowCount !== 1)
          throw new Error("notification completion conflict");
      }
    });
  }

  async recordNotificationDeliveryFailure(
    context: TenantContext,
    input: { deliveryId: string; errorClass: string },
  ): Promise<void> {
    await this.withTenant(context, async (client) => {
      await client.query(
        "update notification_deliveries set status='failed',last_error_class=$1,attempt_count=attempt_count+1,version=version+1 where id=$2 and status<>'sent'",
        [input.errorClass.slice(0, 120), input.deliveryId],
      );
    });
  }

  async recordConsent(
    context: TenantContext,
    input: {
      personId: string;
      purpose: string;
      policyVersion: string;
      grantedAt: string;
    },
  ): Promise<{ id: string; version: number }> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{ id: string; version: number }>(
        "insert into consents(id,organization_id,household_id,person_id,purpose,policy_version,granted_at) values ($1,$2,$3,$4,$5,$6,$7) returning id,version",
        [
          randomUUID(),
          context.organizationId,
          context.householdId,
          input.personId,
          input.purpose,
          input.policyVersion,
          input.grantedAt,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("consent insert returned no row");
      return row;
    });
  }

  async startDocumentUpload(
    context: TenantContext,
    input: {
      id: string;
      objectKey: string;
      originalSha256: string;
      mediaType: string;
      wrappedDataKey: unknown;
      encryptionKeyVersion: number;
      maximumBytes: number;
      idempotencyKey: string;
      expiresAt?: string;
      documentConsentPolicyVersion: string;
      deleteOriginalAfterProcessing: boolean;
      consentedAt: string;
    },
  ): Promise<DocumentUploadRecord> {
    return this.withTenant(context, async (client) => {
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            originalSha256: input.originalSha256,
            mediaType: input.mediaType,
            maximumBytes: input.maximumBytes,
            expiresAt: input.expiresAt ?? null,
            documentConsentPolicyVersion: input.documentConsentPolicyVersion,
            deleteOriginalAfterProcessing: input.deleteOriginalAfterProcessing,
          }),
        )
        .digest("hex");
      const reserved = await client.query(
        "insert into idempotency_records(organization_id,household_id,idempotency_key,request_hash,expires_at) values ($1,$2,$3,$4,now()+interval '24 hours') on conflict do nothing",
        [
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
          requestHash,
        ],
      );
      let documentId = input.id;
      if (reserved.rowCount === 0) {
        const existing = await client.query<{
          request_hash: string;
          response_body: { document?: { id?: string } } | null;
        }>(
          "select request_hash,response_body from idempotency_records where organization_id=$1 and household_id=$2 and idempotency_key=$3",
          [context.organizationId, context.householdId, input.idempotencyKey],
        );
        const reservation = existing.rows[0];
        const replayId = reservation?.response_body?.document?.id;
        if (reservation?.request_hash !== requestHash || !replayId)
          throw new Error("document upload idempotency conflict");
        documentId = replayId;
      } else {
        await client.query(
          "insert into documents(id,organization_id,household_id,object_key,original_sha256,media_type,status,encryption_key_version,wrapped_data_key,maximum_bytes,expires_at,delete_original_after_processing) values ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,$11)",
          [
            input.id,
            context.organizationId,
            context.householdId,
            input.objectKey,
            input.originalSha256,
            input.mediaType,
            input.encryptionKeyVersion,
            JSON.stringify(input.wrappedDataKey),
            input.maximumBytes,
            input.expiresAt ?? null,
            input.deleteOriginalAfterProcessing,
          ],
        );
        await client.query(
          "insert into document_consents(id,organization_id,household_id,document_id,person_id,policy_version,granted_at) values ($1,$2,$3,$4,$5,$6,$7)",
          [
            randomUUID(),
            context.organizationId,
            context.householdId,
            input.id,
            context.actorId,
            input.documentConsentPolicyVersion,
            input.consentedAt,
          ],
        );
        await client.query(
          "update idempotency_records set status_code=201,response_body=$1 where organization_id=$2 and household_id=$3 and idempotency_key=$4",
          [
            JSON.stringify({ document: { id: input.id } }),
            context.organizationId,
            context.householdId,
            input.idempotencyKey,
          ],
        );
      }
      const result = await client.query<{
        id: string;
        object_key: string;
        original_sha256: string;
        media_type: string;
        status: string;
        encryption_key_version: number;
        wrapped_data_key: unknown;
        maximum_bytes: string;
        version: number;
        delete_original_after_processing: boolean;
        original_deleted_at: Date | null;
      }>(
        "select id,object_key,original_sha256,media_type,status,encryption_key_version,wrapped_data_key,maximum_bytes,version,delete_original_after_processing,original_deleted_at from documents where id=$1",
        [documentId],
      );
      const row = result.rows[0];
      if (!row || row.status !== "pending" || !row.wrapped_data_key)
        throw new Error("document upload is unavailable");
      return {
        id: row.id,
        objectKey: row.object_key,
        originalSha256: row.original_sha256,
        mediaType: row.media_type,
        status: row.status,
        encryptionKeyVersion: row.encryption_key_version,
        wrappedDataKey: row.wrapped_data_key,
        maximumBytes: Number(row.maximum_bytes),
        version: row.version,
        deleteOriginalAfterProcessing: row.delete_original_after_processing,
        originalDeletedAt: row.original_deleted_at?.toISOString() ?? null,
      };
    });
  }

  async getPendingDocumentUpload(
    context: TenantContext,
    documentId: string,
  ): Promise<DocumentUploadRecord> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        object_key: string;
        original_sha256: string;
        media_type: string;
        status: string;
        encryption_key_version: number;
        wrapped_data_key: unknown;
        maximum_bytes: string;
        version: number;
        delete_original_after_processing: boolean;
        original_deleted_at: Date | null;
      }>(
        "select id,object_key,original_sha256,media_type,status,encryption_key_version,wrapped_data_key,maximum_bytes,version,delete_original_after_processing,original_deleted_at from documents where id=$1 and status='pending'",
        [documentId],
      );
      const row = result.rows[0];
      if (!row || !row.wrapped_data_key)
        throw new Error("document upload is unavailable");
      return {
        id: row.id,
        objectKey: row.object_key,
        originalSha256: row.original_sha256,
        mediaType: row.media_type,
        status: row.status,
        encryptionKeyVersion: row.encryption_key_version,
        wrappedDataKey: row.wrapped_data_key,
        maximumBytes: Number(row.maximum_bytes),
        version: row.version,
        deleteOriginalAfterProcessing: row.delete_original_after_processing,
        originalDeletedAt: row.original_deleted_at?.toISOString() ?? null,
      };
    });
  }

  async completeDocumentUpload(
    context: TenantContext,
    input: {
      documentId: string;
      expectedVersion: number;
      ciphertextSha256: string;
      idempotencyKey: string;
      uploadedAt: string;
    },
  ): Promise<StartedDocumentProcessing> {
    return this.withTenant(context, async (client) => {
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            documentId: input.documentId,
            expectedVersion: input.expectedVersion,
            ciphertextSha256: input.ciphertextSha256,
          }),
        )
        .digest("hex");
      const reserved = await client.query(
        "insert into idempotency_records(organization_id,household_id,idempotency_key,request_hash,expires_at) values ($1,$2,$3,$4,now()+interval '24 hours') on conflict do nothing",
        [
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
          requestHash,
        ],
      );
      if (reserved.rowCount === 0) {
        const existing = await client.query<{
          request_hash: string;
          response_body: StartedDocumentProcessing | null;
        }>(
          "select request_hash,response_body from idempotency_records where organization_id=$1 and household_id=$2 and idempotency_key=$3",
          [context.organizationId, context.householdId, input.idempotencyKey],
        );
        const row = existing.rows[0];
        if (row?.request_hash !== requestHash || !row.response_body)
          throw new Error("document completion idempotency conflict");
        return row.response_body;
      }
      const documentResult = await client.query<{
        id: string;
        status: string;
        version: number;
      }>(
        "update documents set status='quarantined',ciphertext_sha256=$1,uploaded_at=$2,version=version+1 where id=$3 and status='pending' and version=$4 returning id,status,version",
        [
          input.ciphertextSha256,
          input.uploadedAt,
          input.documentId,
          input.expectedVersion,
        ],
      );
      const document = documentResult.rows[0];
      if (!document) throw new Error("document upload version conflict");
      const workflowResult = await client.query<{
        id: string;
        status: string;
        version: number;
      }>(
        "insert into workflow_runs(id,organization_id,household_id,kind,idempotency_key,status,completed_steps,next_step,subject_type,subject_id) values ($1,$2,$3,'document-processing',$4,'pending','[]','scan','Document',$5) returning id,status,version",
        [
          randomUUID(),
          context.organizationId,
          context.householdId,
          `document:${input.documentId}`,
          input.documentId,
        ],
      );
      const workflow = workflowResult.rows[0];
      if (!workflow) throw new Error("document workflow was not persisted");
      const response = { document, workflow };
      await client.query(
        "update idempotency_records set status_code=202,response_body=$1 where organization_id=$2 and household_id=$3 and idempotency_key=$4",
        [
          JSON.stringify(response),
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
        ],
      );
      return response;
    });
  }

  async getDocumentProcessingInput(
    context: TenantContext,
    workflowId: string,
  ): Promise<DocumentProcessingInput> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        object_key: string;
        original_sha256: string;
        media_type: string;
        status: string;
        encryption_key_version: number;
        wrapped_data_key: unknown;
        maximum_bytes: string;
        version: number;
        delete_original_after_processing: boolean;
        original_deleted_at: Date | null;
        workflow_id: string;
        workflow_status: string;
        workflow_version: number;
        next_step: string | null;
      }>(
        "select d.id,d.object_key,d.original_sha256,d.media_type,d.status,d.encryption_key_version,d.wrapped_data_key,d.maximum_bytes,d.version,d.delete_original_after_processing,d.original_deleted_at,w.id as workflow_id,w.status as workflow_status,w.version as workflow_version,w.next_step from documents d join workflow_runs w on w.subject_type='Document' and w.subject_id=d.id where w.id=$1",
        [workflowId],
      );
      const row = result.rows[0];
      if (!row || !row.wrapped_data_key)
        throw new Error("document processing input is unavailable");
      return {
        id: row.id,
        objectKey: row.object_key,
        originalSha256: row.original_sha256,
        mediaType: row.media_type,
        status: row.status,
        encryptionKeyVersion: row.encryption_key_version,
        wrappedDataKey: row.wrapped_data_key,
        maximumBytes: Number(row.maximum_bytes),
        version: row.version,
        deleteOriginalAfterProcessing: row.delete_original_after_processing,
        originalDeletedAt: row.original_deleted_at?.toISOString() ?? null,
        workflowId: row.workflow_id,
        workflowStatus: row.workflow_status,
        workflowVersion: row.workflow_version,
        nextStep: row.next_step,
      };
    });
  }

  async completeDocumentScan(
    context: TenantContext,
    input: {
      documentId: string;
      workflowId: string;
      documentVersion: number;
      workflowVersion: number;
      outcome: "clean" | "rejected";
      processedAt: string;
    },
  ): Promise<void> {
    await this.withTenant(context, async (client) => {
      const document = await client.query(
        "update documents set status=$1,processed_at=$2,last_error_class=null,version=version+1 where id=$3 and status='quarantined' and version=$4",
        [
          input.outcome,
          input.processedAt,
          input.documentId,
          input.documentVersion,
        ],
      );
      if (document.rowCount !== 1)
        throw new Error("document scan completion conflict");
      const terminal = input.outcome === "rejected";
      const workflow = await client.query(
        "update workflow_runs set status=$1,completed_steps=case when completed_steps ? 'scan' then completed_steps else completed_steps || '[\"scan\"]'::jsonb end,next_step=$2,last_error_class=null,version=version+1 where id=$3 and version=$4 and next_step='scan'",
        [
          terminal ? "completed" : "running",
          terminal ? null : "ocr",
          input.workflowId,
          input.workflowVersion,
        ],
      );
      if (workflow.rowCount !== 1)
        throw new Error("document scan workflow conflict");
    });
  }

  async recordDocumentScanFailure(
    context: TenantContext,
    input: {
      documentId: string;
      workflowId: string;
      errorClass: string;
    },
  ): Promise<void> {
    await this.withTenant(context, async (client) => {
      const errorClass = input.errorClass.slice(0, 120);
      await client.query(
        "update documents set last_error_class=$1,version=version+1 where id=$2 and status='quarantined'",
        [errorClass, input.documentId],
      );
      await client.query(
        "update workflow_runs set status='failed',last_error_class=$1,version=version+1 where id=$2 and status<>'completed'",
        [errorClass, input.workflowId],
      );
    });
  }

  async completeDocumentOcr(
    context: TenantContext,
    input: {
      documentId: string;
      workflowId: string;
      workflowVersion: number;
      derivativeId: string;
      objectKey: string;
      ciphertextSha256: string;
      encryptionKeyVersion: number;
      createdAt: string;
    },
  ): Promise<void> {
    await this.withTenant(context, async (client) => {
      await client.query(
        "insert into document_derivatives(id,organization_id,household_id,document_id,kind,object_key,ciphertext_sha256,encryption_key_version,created_at) values ($1,$2,$3,$4,'searchable-pdf',$5,$6,$7,$8) on conflict (document_id,kind) do nothing",
        [
          input.derivativeId,
          context.organizationId,
          context.householdId,
          input.documentId,
          input.objectKey,
          input.ciphertextSha256,
          input.encryptionKeyVersion,
          input.createdAt,
        ],
      );
      const derivative = await client.query(
        "select 1 from document_derivatives where document_id=$1 and kind='searchable-pdf' and object_key=$2 and ciphertext_sha256=$3 and encryption_key_version=$4",
        [
          input.documentId,
          input.objectKey,
          input.ciphertextSha256,
          input.encryptionKeyVersion,
        ],
      );
      if (derivative.rowCount !== 1)
        throw new Error("document OCR derivative conflict");
      const workflow = await client.query(
        "update workflow_runs set status='running',completed_steps=case when completed_steps ? 'ocr' then completed_steps else completed_steps || '[\"ocr\"]'::jsonb end,next_step=case when (select delete_original_after_processing from documents where id=$3) then 'delete-original' else 'classification' end,last_error_class=null,version=version+1 where id=$1 and version=$2 and next_step='ocr'",
        [input.workflowId, input.workflowVersion, input.documentId],
      );
      if (workflow.rowCount !== 1)
        throw new Error("document OCR workflow conflict");
    });
  }

  async completeDocumentOriginalDeletion(
    context: TenantContext,
    input: { documentId: string; workflowId: string; deletedAt: string },
  ): Promise<void> {
    await this.withTenant(context, async (client) => {
      await client.query(
        "update documents set original_deleted_at=coalesce(original_deleted_at,$1),version=case when original_deleted_at is null then version+1 else version end where id=$2 and delete_original_after_processing=true",
        [input.deletedAt, input.documentId],
      );
      const workflow = await client.query(
        "update workflow_runs set status='running',completed_steps=case when completed_steps ? 'delete-original' then completed_steps else completed_steps || '[\"delete-original\"]'::jsonb end,next_step='classification',last_error_class=null,version=version+1 where id=$1 and next_step='delete-original'",
        [input.workflowId],
      );
      if (workflow.rowCount !== 1) {
        const completed = await client.query(
          "select 1 from workflow_runs where id=$1 and completed_steps ? 'delete-original'",
          [input.workflowId],
        );
        if (completed.rowCount !== 1)
          throw new Error("document original deletion conflict");
      }
    });
  }

  async completeManualDocumentExtraction(
    context: TenantContext,
    input: {
      documentId: string;
      workflowId: string;
      expectedWorkflowVersion: number;
      idempotencyKey: string;
      requestFingerprint: string;
      capturedAt: string;
      candidates: readonly ManualDocumentCandidateWrite[];
    },
  ): Promise<{
    documentId: string;
    workflowId: string;
    status: "completed";
    candidates: { id: string; status: "candidate"; version: number }[];
  }> {
    return this.withTenant(context, async (client) => {
      const reserved = await client.query(
        "insert into idempotency_records(organization_id,household_id,idempotency_key,request_hash,expires_at) values ($1,$2,$3,$4,now()+interval '24 hours') on conflict do nothing",
        [
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
          input.requestFingerprint,
        ],
      );
      if (reserved.rowCount === 0) {
        const existing = await client.query<{
          request_hash: string;
          response_body: {
            documentId: string;
            workflowId: string;
            status: "completed";
            candidates: {
              id: string;
              status: "candidate";
              version: number;
            }[];
          } | null;
        }>(
          "select request_hash,response_body from idempotency_records where organization_id=$1 and household_id=$2 and idempotency_key=$3",
          [context.organizationId, context.householdId, input.idempotencyKey],
        );
        const row = existing.rows[0];
        if (
          row?.request_hash !== input.requestFingerprint ||
          !row.response_body
        )
          throw new Error("manual extraction idempotency conflict");
        return row.response_body;
      }
      const workflow = await client.query(
        "select 1 from workflow_runs w join documents d on w.subject_type='Document' and w.subject_id=d.id where w.id=$1 and d.id=$2 and d.status='clean' and w.next_step='classification' and w.version=$3 for update of w",
        [input.workflowId, input.documentId, input.expectedWorkflowVersion],
      );
      if (workflow.rowCount !== 1)
        throw new Error("manual extraction workflow conflict");
      const candidates: {
        id: string;
        status: "candidate";
        version: number;
      }[] = [];
      for (const candidate of input.candidates) {
        await client.query(
          "insert into evidence(id,organization_id,household_id,source_type,source_id,locator,captured_at) values ($1,$2,$3,'document',$4,$5,$6)",
          [
            candidate.evidenceId,
            context.organizationId,
            context.householdId,
            input.documentId,
            candidate.locator,
            input.capturedAt,
          ],
        );
        const result = await client.query<{
          id: string;
          status: "candidate";
          version: number;
        }>(
          "insert into facts(id,organization_id,household_id,field_key,typed_value_encrypted,key_version,status,source_type,source_id,evidence_ids,confidence,sensitivity) values ($1,$2,$3,$4,$5,$6,'candidate','document',$7,$8,$9,$10) returning id,status,version",
          [
            candidate.id,
            context.organizationId,
            context.householdId,
            candidate.fieldKey,
            Buffer.from(candidate.ciphertext),
            candidate.keyVersion,
            input.documentId,
            JSON.stringify([candidate.evidenceId]),
            candidate.confidence ?? null,
            candidate.sensitivity,
          ],
        );
        const row = result.rows[0];
        if (!row) throw new Error("manual candidate insert returned no row");
        candidates.push(row);
      }
      const completed = await client.query(
        "update workflow_runs set status='completed',completed_steps=completed_steps || '[\"classification\",\"manual-extraction\"]'::jsonb,next_step=null,last_error_class=null,version=version+1 where id=$1 and version=$2 and next_step='classification'",
        [input.workflowId, input.expectedWorkflowVersion],
      );
      if (completed.rowCount !== 1)
        throw new Error("manual extraction completion conflict");
      const response = {
        documentId: input.documentId,
        workflowId: input.workflowId,
        status: "completed" as const,
        candidates,
      };
      await client.query(
        "update idempotency_records set status_code=201,response_body=$1 where organization_id=$2 and household_id=$3 and idempotency_key=$4",
        [
          JSON.stringify(response),
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
        ],
      );
      return response;
    });
  }

  async withdrawConsent(
    context: TenantContext,
    consentId: string,
    expectedVersion: number,
    withdrawnAt: string,
  ): Promise<{ id: string; withdrawnAt: string; version: number }> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        withdrawn_at: Date;
        version: number;
      }>(
        "update consents set withdrawn_at=$1,version=version+1 where id=$2 and version=$3 and withdrawn_at is null returning id,withdrawn_at,version",
        [withdrawnAt, consentId, expectedVersion],
      );
      const row = result.rows[0];
      if (!row) throw new Error("consent withdrawal conflict or unavailable");
      return {
        id: row.id,
        withdrawnAt: row.withdrawn_at.toISOString(),
        version: row.version,
      };
    });
  }

  async getActiveConsent(
    context: TenantContext,
    input: { personId: string; purpose: string },
  ): Promise<{ id: string; policyVersion: string; version: number } | null> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        policy_version: string;
        version: number;
      }>(
        "select id,policy_version,version from consents where person_id=$1 and purpose=$2 and withdrawn_at is null order by granted_at desc,id desc limit 1",
        [input.personId, input.purpose],
      );
      const row = result.rows[0];
      return row
        ? {
            id: row.id,
            policyVersion: row.policy_version,
            version: row.version,
          }
        : null;
    });
  }

  async beginWorkflow(
    context: TenantContext,
    input: { kind: string; idempotencyKey: string; firstStep: string },
  ): Promise<{ id: string; status: string; version: number }> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        status: string;
        version: number;
      }>(
        "insert into workflow_runs(id,organization_id,household_id,kind,idempotency_key,status,completed_steps,next_step) values ($1,$2,$3,$4,$5,'pending','[]',$6) on conflict (organization_id,household_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id,status,version",
        [
          randomUUID(),
          context.organizationId,
          context.householdId,
          input.kind,
          input.idempotencyKey,
          input.firstStep,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("workflow insert returned no row");
      return row;
    });
  }

  async getWorkflow(
    context: TenantContext,
    workflowId: string,
  ): Promise<PersistedWorkflow> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        kind: string;
        status: string;
        completed_steps: string[];
        next_step: string | null;
        version: number;
      }>(
        "select id,kind,status,completed_steps,next_step,version from workflow_runs where id=$1",
        [workflowId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("workflow unavailable");
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        completedSteps: row.completed_steps,
        nextStep: row.next_step,
        version: row.version,
      };
    });
  }

  async completeWorkflowStep(
    context: TenantContext,
    input: {
      workflowId: string;
      expectedVersion: number;
      step: string;
      nextStep: string | null;
    },
  ): Promise<PersistedWorkflow> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        kind: string;
        status: string;
        completed_steps: string[];
        next_step: string | null;
        version: number;
      }>(
        "update workflow_runs set completed_steps=case when completed_steps ? $1 then completed_steps else completed_steps || jsonb_build_array($1::text) end,next_step=$2,status=case when $2::text is null then 'completed' else 'running' end,last_error_class=null,version=version+1 where id=$3 and version=$4 and status<>'completed' returning id,kind,status,completed_steps,next_step,version",
        [input.step, input.nextStep, input.workflowId, input.expectedVersion],
      );
      const row = result.rows[0];
      if (!row) throw new Error("workflow version conflict");
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        completedSteps: row.completed_steps,
        nextStep: row.next_step,
        version: row.version,
      };
    });
  }

  async recordWorkflowFailure(
    context: TenantContext,
    workflowId: string,
    errorClass: string,
  ): Promise<void> {
    await this.withTenant(context, async (client) => {
      await client.query(
        "update workflow_runs set status='failed',last_error_class=$1,version=version+1 where id=$2 and status<>'completed'",
        [errorClass.slice(0, 120), workflowId],
      );
    });
  }

  async processBillingEvent(
    context: TenantContext,
    event: NormalizedBillingEvent,
  ): Promise<{ outcome: "applied" | "duplicate" | "stale" }> {
    return this.withTenant(context, async (client) => {
      const inserted = await client.query(
        "insert into billing_events(id,organization_id,household_id,external_event_id,event_type,provider_created_at,payload) values ($1,$2,$3,$4,$5,$6,$7) on conflict (external_event_id) do nothing",
        [
          randomUUID(),
          context.organizationId,
          context.householdId,
          event.externalEventId,
          event.eventType,
          event.providerCreatedAt,
          JSON.stringify({
            providerCustomerId: event.providerCustomerId,
            providerSubscriptionId: event.providerSubscriptionId,
            status: event.status,
            plan: event.plan,
          }),
        ],
      );
      if (inserted.rowCount === 0) return { outcome: "duplicate" };
      const subscription = await client.query(
        "insert into subscriptions(id,organization_id,household_id,status,plan,provider_customer_id,provider_subscription_id,provider_updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (organization_id,household_id) do update set status=excluded.status,plan=excluded.plan,provider_customer_id=excluded.provider_customer_id,provider_subscription_id=excluded.provider_subscription_id,provider_updated_at=excluded.provider_updated_at,version=subscriptions.version+1 where subscriptions.provider_updated_at is null or subscriptions.provider_updated_at <= excluded.provider_updated_at returning id",
        [
          randomUUID(),
          context.organizationId,
          context.householdId,
          event.status,
          event.plan,
          event.providerCustomerId,
          event.providerSubscriptionId,
          event.providerCreatedAt,
        ],
      );
      await client.query(
        "update billing_events set processed_at=now() where external_event_id=$1",
        [event.externalEventId],
      );
      return { outcome: subscription.rowCount === 1 ? "applied" : "stale" };
    });
  }

  async getSubscription(
    context: TenantContext,
  ): Promise<SubscriptionReadModel> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        status: SubscriptionReadModel["status"];
        plan: string;
        provider_updated_at: Date | null;
        version: number;
      }>(
        "select status,plan,provider_updated_at,version from subscriptions order by version desc limit 1",
      );
      const row = result.rows[0];
      if (!row)
        return {
          status: "inactive",
          plan: null,
          providerUpdatedAt: null,
          version: 0,
        };
      return {
        status: row.status,
        plan: row.plan,
        providerUpdatedAt: row.provider_updated_at?.toISOString() ?? null,
        version: row.version,
      };
    });
  }

  async startPrivacyRequest(
    context: TenantContext,
    input: {
      personId: string;
      kind: PrivacyRequestKind;
      idempotencyKey: string;
      requestedAt: string;
    },
  ): Promise<{
    privacyRequest: {
      id: string;
      kind: PrivacyRequestKind;
      status: string;
      version: number;
    };
    workflow?: { id: string; status: string; version: number };
  }> {
    if (input.personId !== context.actorId)
      throw new Error(
        "privacy request subject must match the authenticated person",
      );
    return this.withTenant(context, async (client) => {
      const requestHash = createHash("sha256")
        .update(JSON.stringify({ personId: input.personId, kind: input.kind }))
        .digest("hex");
      const inserted = await client.query(
        "insert into idempotency_records(organization_id,household_id,idempotency_key,request_hash,expires_at) values ($1,$2,$3,$4,now()+interval '24 hours') on conflict do nothing",
        [
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
          requestHash,
        ],
      );
      if (inserted.rowCount === 0) {
        const existing = await client.query<{
          request_hash: string;
          response_body: unknown;
        }>(
          "select request_hash,response_body from idempotency_records where organization_id=$1 and household_id=$2 and idempotency_key=$3",
          [context.organizationId, context.householdId, input.idempotencyKey],
        );
        const row = existing.rows[0];
        if (!row || row.request_hash !== requestHash)
          throw new Error("idempotency key reused with different request");
        if (!row.response_body)
          throw new Error("privacy request is still processing");
        return row.response_body as {
          privacyRequest: {
            id: string;
            kind: PrivacyRequestKind;
            status: string;
            version: number;
          };
          workflow?: { id: string; status: string; version: number };
        };
      }

      const privacyId = randomUUID();
      const privacyResult = await client.query<{
        id: string;
        kind: PrivacyRequestKind;
        status: string;
        version: number;
      }>(
        "insert into privacy_requests(id,organization_id,household_id,person_id,kind,status,requested_at) values ($1,$2,$3,$4,$5,'identity-verification',$6) returning id,kind,status,version",
        [
          privacyId,
          context.organizationId,
          context.householdId,
          input.personId,
          input.kind,
          input.requestedAt,
        ],
      );
      const privacyRequest = privacyResult.rows[0];
      if (!privacyRequest)
        throw new Error("privacy request insert returned no row");
      let workflow: { id: string; status: string; version: number } | undefined;
      if (input.kind === "export" || input.kind === "deletion") {
        const workflowId = randomUUID();
        const workflowResult = await client.query<{
          id: string;
          status: string;
          version: number;
        }>(
          "insert into workflow_runs(id,organization_id,household_id,kind,idempotency_key,status,completed_steps,next_step,subject_type,subject_id) values ($1,$2,$3,$4,$5,'pending','[]','identity-verification','PrivacyRequest',$6) returning id,status,version",
          [
            workflowId,
            context.organizationId,
            context.householdId,
            input.kind,
            `privacy:${privacyId}`,
            privacyId,
          ],
        );
        workflow = workflowResult.rows[0];
        if (!workflow)
          throw new Error("privacy workflow insert returned no row");
      }
      const response = {
        privacyRequest,
        ...(workflow ? { workflow } : {}),
      };
      await client.query(
        "update idempotency_records set status_code=202,response_body=$1 where organization_id=$2 and household_id=$3 and idempotency_key=$4",
        [
          JSON.stringify(response),
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
        ],
      );
      return response;
    });
  }

  async confirmPrivacyDeletion(
    context: TenantContext,
    input: {
      requestId: string;
      expectedVersion: number;
      idempotencyKey: string;
      confirmedAt: string;
      recoveryDays: number;
    },
  ): Promise<ConfirmedPrivacyDeletion> {
    return this.withTenant(context, async (client) => {
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            requestId: input.requestId,
            expectedVersion: input.expectedVersion,
            recoveryDays: input.recoveryDays,
          }),
        )
        .digest("hex");
      const reserved = await client.query(
        "insert into idempotency_records(organization_id,household_id,idempotency_key,request_hash,expires_at) values ($1,$2,$3,$4,now()+interval '24 hours') on conflict do nothing",
        [
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
          requestHash,
        ],
      );
      if (reserved.rowCount === 0) {
        const replay = await client.query<{
          request_hash: string;
          response_body: ConfirmedPrivacyDeletion | null;
        }>(
          "select request_hash,response_body from idempotency_records where organization_id=$1 and household_id=$2 and idempotency_key=$3",
          [context.organizationId, context.householdId, input.idempotencyKey],
        );
        const row = replay.rows[0];
        if (!row || row.request_hash !== requestHash)
          throw new Error("idempotency key reused with different request");
        if (!row.response_body)
          throw new Error("privacy deletion confirmation is still processing");
        return row.response_body;
      }

      const existing = await client.query<{
        person_id: string;
        kind: string;
        status: string;
      }>(
        "select person_id,kind,status from privacy_requests where id=$1 for update",
        [input.requestId],
      );
      const request = existing.rows[0];
      if (
        !request ||
        request.person_id !== context.actorId ||
        request.kind !== "deletion" ||
        request.status !== "identity-verification"
      )
        throw new Error("privacy deletion request is unavailable");
      const confirmedAt = new Date(input.confirmedAt);
      const recoveryUntil = new Date(
        confirmedAt.getTime() + input.recoveryDays * 86_400_000,
      );
      if (
        !Number.isFinite(confirmedAt.getTime()) ||
        !Number.isFinite(recoveryUntil.getTime())
      )
        throw new Error("privacy deletion confirmation time is invalid");
      const privacyResult = await client.query<{
        id: string;
        status: "recovery-period";
        version: number;
        recovery_until: Date;
      }>(
        "update privacy_requests set status='recovery-period',verified_at=$1,recovery_until=$2,version=version+1 where id=$3 and version=$4 returning id,status,version,recovery_until",
        [
          confirmedAt.toISOString(),
          recoveryUntil.toISOString(),
          input.requestId,
          input.expectedVersion,
        ],
      );
      const privacyRequest = privacyResult.rows[0];
      if (!privacyRequest)
        throw new Error("privacy deletion confirmation version conflict");
      const workflowResult = await client.query<{
        id: string;
        status: string;
        version: number;
      }>(
        "update workflow_runs set status='pending',completed_steps='[\"identity-verification\"]',next_step='active-system',version=version+1 where subject_type='PrivacyRequest' and subject_id=$1 and kind='deletion' and next_step='identity-verification' returning id,status,version",
        [input.requestId],
      );
      const workflow = workflowResult.rows[0];
      if (!workflow)
        throw new Error("privacy deletion workflow is unavailable");
      const executionResult = await client.query<{
        id: string;
        status: "recovery-period";
        version: number;
      }>(
        "insert into deletion_executions(id,organization_id,household_id,privacy_request_id,workflow_id,person_id,status,recovery_until) values ($1,$2,$3,$4,$5,$6,'recovery-period',$7) returning id,status,version",
        [
          randomUUID(),
          context.organizationId,
          context.householdId,
          input.requestId,
          workflow.id,
          context.actorId,
          recoveryUntil.toISOString(),
        ],
      );
      const execution = executionResult.rows[0];
      if (!execution)
        throw new Error("privacy deletion execution was not persisted");
      const response: ConfirmedPrivacyDeletion = {
        privacyRequest: {
          id: privacyRequest.id,
          status: privacyRequest.status,
          version: privacyRequest.version,
          recoveryUntil: privacyRequest.recovery_until.toISOString(),
        },
        execution,
        workflow,
      };
      await client.query(
        "update idempotency_records set status_code=202,response_body=$1 where organization_id=$2 and household_id=$3 and idempotency_key=$4",
        [
          JSON.stringify(response),
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
        ],
      );
      return response;
    });
  }

  async getPrivacyDeletionInput(
    context: TenantContext,
    workflowId: string,
  ): Promise<PrivacyDeletionInput> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        execution_id: string;
        privacy_request_id: string;
        workflow_id: string;
        person_id: string;
        status: string;
        recovery_until: Date;
        version: number;
      }>(
        "select de.id as execution_id,de.privacy_request_id,de.workflow_id,de.person_id,de.status,de.recovery_until,de.version from deletion_executions de join privacy_requests pr on pr.id=de.privacy_request_id join workflow_runs w on w.id=de.workflow_id where de.workflow_id=$1 and pr.kind='deletion' and w.kind='deletion' and w.subject_type='PrivacyRequest' and w.subject_id=pr.id",
        [workflowId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("privacy deletion execution is unavailable");
      const holds = await client.query<{ category: string }>(
        "select distinct category from legal_holds where released_at is null and starts_at<=now() and (expires_at is null or expires_at>now()) and ((subject_type='Household' and subject_id=$1) or (subject_type='Person' and subject_id=$2)) order by category",
        [context.householdId, row.person_id],
      );
      return {
        executionId: row.execution_id,
        privacyRequestId: row.privacy_request_id,
        workflowId: row.workflow_id,
        personId: row.person_id,
        status: row.status,
        recoveryUntil: row.recovery_until.toISOString(),
        version: row.version,
        legalHoldCategories: holds.rows.map((hold) => hold.category),
      };
    });
  }

  async cancelPrivacyDeletion(
    context: TenantContext,
    input: {
      requestId: string;
      expectedVersion: number;
      idempotencyKey: string;
    },
  ): Promise<CancelledPrivacyDeletion> {
    return this.withTenant(context, async (client) => {
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            requestId: input.requestId,
            expectedVersion: input.expectedVersion,
          }),
        )
        .digest("hex");
      const reserved = await client.query(
        "insert into idempotency_records(organization_id,household_id,idempotency_key,request_hash,expires_at) values ($1,$2,$3,$4,now()+interval '24 hours') on conflict do nothing",
        [
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
          requestHash,
        ],
      );
      if (reserved.rowCount === 0) {
        const replay = await client.query<{
          request_hash: string;
          response_body: CancelledPrivacyDeletion | null;
        }>(
          "select request_hash,response_body from idempotency_records where organization_id=$1 and household_id=$2 and idempotency_key=$3",
          [context.organizationId, context.householdId, input.idempotencyKey],
        );
        const row = replay.rows[0];
        if (!row || row.request_hash !== requestHash)
          throw new Error("idempotency key reused with different request");
        if (!row.response_body)
          throw new Error("privacy deletion cancellation is still processing");
        return row.response_body;
      }
      const privacyResult = await client.query<{
        id: string;
        status: "cancelled";
        version: number;
      }>(
        "update privacy_requests set status='cancelled',completed_at=now(),version=version+1 where id=$1 and person_id=$2 and kind='deletion' and status='recovery-period' and version=$3 returning id,status,version",
        [input.requestId, context.actorId, input.expectedVersion],
      );
      const privacyRequest = privacyResult.rows[0];
      if (!privacyRequest)
        throw new Error("privacy deletion cancellation conflict");
      const executionResult = await client.query<{
        id: string;
        status: "cancelled";
        version: number;
      }>(
        "update deletion_executions set status='cancelled',completed_at=now(),version=version+1 where privacy_request_id=$1 and status='recovery-period' returning id,status,version",
        [input.requestId],
      );
      const execution = executionResult.rows[0];
      if (!execution)
        throw new Error("privacy deletion execution cancellation conflict");
      const workflowResult = await client.query<{
        id: string;
        status: "completed";
        version: number;
      }>(
        "update workflow_runs set status='completed',completed_steps=case when completed_steps ? 'cancelled' then completed_steps else completed_steps || '[\"cancelled\"]'::jsonb end,next_step=null,last_error_class=null,version=version+1 where subject_type='PrivacyRequest' and subject_id=$1 and kind='deletion' and status<>'completed' returning id,status,version",
        [input.requestId],
      );
      const workflow = workflowResult.rows[0];
      if (!workflow)
        throw new Error("privacy deletion workflow cancellation conflict");
      const response = { privacyRequest, execution, workflow };
      await client.query(
        "update idempotency_records set status_code=200,response_body=$1 where organization_id=$2 and household_id=$3 and idempotency_key=$4",
        [
          JSON.stringify(response),
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
        ],
      );
      return response;
    });
  }

  async completePrivacyDeletionActiveSystem(
    context: TenantContext,
    input: {
      executionId: string;
      expectedVersion: number;
      completedAt: string;
      backupRetentionDays: number;
    },
  ): Promise<PrivacyDeletionProgress> {
    return this.withTenant(context, async (client) => {
      const executionResult = await client.query<{
        privacy_request_id: string;
        workflow_id: string;
        person_id: string;
        status: string;
        recovery_until: Date;
        version: number;
      }>(
        "select privacy_request_id,workflow_id,person_id,status,recovery_until,version from deletion_executions where id=$1 for update",
        [input.executionId],
      );
      const execution = executionResult.rows[0];
      if (
        !execution ||
        execution.version !== input.expectedVersion ||
        execution.status !== "recovery-period"
      )
        throw new Error("privacy deletion execution conflict");
      const completedAt = new Date(input.completedAt);
      if (!Number.isFinite(completedAt.getTime()))
        throw new Error("privacy deletion completion time is invalid");
      if (completedAt.getTime() < execution.recovery_until.getTime())
        throw new Error("privacy deletion recovery period has not elapsed");
      const holds = await client.query<{ category: string }>(
        "select distinct category from legal_holds where released_at is null and starts_at<=$1 and (expires_at is null or expires_at>$1) and ((subject_type='Household' and subject_id=$2) or (subject_type='Person' and subject_id=$3)) order by category",
        [completedAt.toISOString(), context.householdId, execution.person_id],
      );
      const legalHoldCategories = holds.rows.map((hold) => hold.category);
      if (legalHoldCategories.length > 0) {
        await client.query(
          "update deletion_executions set status='blocked-legal-hold',retained_categories=$1,version=version+1 where id=$2",
          [JSON.stringify(legalHoldCategories), input.executionId],
        );
        await client.query(
          "update privacy_requests set status='blocked-legal-hold',version=version+1 where id=$1",
          [execution.privacy_request_id],
        );
        await client.query(
          "update workflow_runs set status='running',next_step='legal-hold-review',last_error_class=null,version=version+1 where id=$1",
          [execution.workflow_id],
        );
        return {
          executionId: input.executionId,
          status: "blocked-legal-hold",
          legalHoldCategories,
        };
      }

      const memberships = await client.query<{
        id: string;
        auth_user_id: string | null;
      }>(
        "select id,auth_user_id from memberships where person_id=$1 and active=1 for update",
        [execution.person_id],
      );
      const membershipIds = memberships.rows.map((membership) => membership.id);
      if (membershipIds.length > 0) {
        await client.query(
          "update permission_grants set revoked_at=coalesce(revoked_at,$1),version=version+1 where membership_id=any($2::uuid[]) and revoked_at is null",
          [completedAt.toISOString(), membershipIds],
        );
        await client.query(
          "update support_access_approvals set revoked_at=coalesce(revoked_at,$1),version=version+1 where support_membership_id=any($2::uuid[]) and revoked_at is null",
          [completedAt.toISOString(), membershipIds],
        );
        await client.query(
          "update memberships set active=0,version=version+1 where id=any($1::uuid[]) and active=1",
          [membershipIds],
        );
      }
      const authUserIds = memberships.rows.flatMap((membership) =>
        membership.auth_user_id ? [membership.auth_user_id] : [],
      );
      if (authUserIds.length > 0)
        await client.query(
          'delete from "session" where "userId"=any($1::text[])',
          [authUserIds],
        );
      await client.query("delete from people where id=$1", [
        execution.person_id,
      ]);

      const processors = ["deepseek", "resend", "sentry", "stripe"];
      for (const processor of processors)
        await client.query(
          "insert into deletion_processor_requests(id,organization_id,household_id,workflow_id,processor,status,requested_at) values ($1,$2,$3,$4,$5,'verification-required',$6) on conflict (workflow_id,processor) do nothing",
          [
            randomUUID(),
            context.organizationId,
            context.householdId,
            execution.workflow_id,
            processor,
            completedAt.toISOString(),
          ],
        );
      const backupExpiresAt = new Date(
        completedAt.getTime() + input.backupRetentionDays * 86_400_000,
      );
      const retainedCategories = [
        "audit-events",
        "billing-records",
        "consent-acceptance",
        "privacy-request-evidence",
      ];
      await client.query(
        "update deletion_executions set status='awaiting-review',active_system_completed_at=$1,backup_expires_at=$2,retained_categories=$3,shared_data_review_required=true,version=version+1 where id=$4",
        [
          completedAt.toISOString(),
          backupExpiresAt.toISOString(),
          JSON.stringify(retainedCategories),
          input.executionId,
        ],
      );
      await client.query(
        "update privacy_requests set status='awaiting-review',version=version+1 where id=$1",
        [execution.privacy_request_id],
      );
      await client.query(
        "update workflow_runs set status='running',completed_steps=case when completed_steps ? 'active-system' then completed_steps else completed_steps || '[\"active-system\"]'::jsonb end,next_step='shared-data-review',last_error_class=null,version=version+1 where id=$1",
        [execution.workflow_id],
      );
      return {
        executionId: input.executionId,
        status: "awaiting-review",
        backupExpiresAt: backupExpiresAt.toISOString(),
        legalHoldCategories: [],
      };
    });
  }

  async startPortableExport(
    context: TenantContext,
    input: {
      idempotencyKey: string;
      exportKeyFingerprint: string;
      wrappedExportKey: unknown;
      encryptionKeyVersion: number;
      requestedAt: string;
    },
  ): Promise<StartedPortableExport> {
    return this.withTenant(context, async (client) => {
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            exportKeyFingerprint: input.exportKeyFingerprint,
            encryptionKeyVersion: input.encryptionKeyVersion,
          }),
        )
        .digest("hex");
      const inserted = await client.query(
        "insert into idempotency_records(organization_id,household_id,idempotency_key,request_hash,expires_at) values ($1,$2,$3,$4,now()+interval '24 hours') on conflict do nothing",
        [
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
          requestHash,
        ],
      );
      if (inserted.rowCount === 0) {
        const existing = await client.query<{
          request_hash: string;
          response_body: unknown;
        }>(
          "select request_hash,response_body from idempotency_records where organization_id=$1 and household_id=$2 and idempotency_key=$3",
          [context.organizationId, context.householdId, input.idempotencyKey],
        );
        const row = existing.rows[0];
        if (!row || row.request_hash !== requestHash)
          throw new Error("idempotency key reused with different request");
        if (!row.response_body)
          throw new Error("export request is still processing");
        return row.response_body as StartedPortableExport;
      }

      const exportId = randomUUID();
      const workflowId = randomUUID();
      const workflowResult = await client.query<{
        id: string;
        status: string;
        version: number;
      }>(
        "insert into workflow_runs(id,organization_id,household_id,kind,idempotency_key,status,completed_steps,next_step,subject_type,subject_id) values ($1,$2,$3,'export',$4,'pending','[]','snapshot','Export',$5) returning id,status,version",
        [
          workflowId,
          context.organizationId,
          context.householdId,
          `export:${exportId}`,
          exportId,
        ],
      );
      const exportResult = await client.query<{
        id: string;
        status: string;
        version: number;
      }>(
        "insert into exports(id,organization_id,household_id,workflow_id,status,wrapped_export_key,encryption_key_version,created_at) values ($1,$2,$3,$4,'pending',$5,$6,$7) returning id,status,version",
        [
          exportId,
          context.organizationId,
          context.householdId,
          workflowId,
          JSON.stringify(input.wrappedExportKey),
          input.encryptionKeyVersion,
          input.requestedAt,
        ],
      );
      const workflow = workflowResult.rows[0];
      const exportRecord = exportResult.rows[0];
      if (!workflow || !exportRecord)
        throw new Error("portable export request was not persisted");
      const response = { export: exportRecord, workflow };
      await client.query(
        "update idempotency_records set status_code=202,response_body=$1 where organization_id=$2 and household_id=$3 and idempotency_key=$4",
        [
          JSON.stringify(response),
          context.organizationId,
          context.householdId,
          input.idempotencyKey,
        ],
      );
      return response;
    });
  }

  async getPortableExportBuildInput(
    context: TenantContext,
    workflowId: string,
  ): Promise<PortableExportBuildInput> {
    return this.withTenant(context, async (client) => {
      const exportResult = await client.query<{
        id: string;
        workflow_id: string;
        status: string;
        created_at: Date;
        wrapped_export_key: unknown;
        encryption_key_version: number;
      }>(
        "select e.id,e.workflow_id,e.status,e.created_at,e.wrapped_export_key,e.encryption_key_version from exports e join workflow_runs w on w.id=e.workflow_id where e.workflow_id=$1 and w.subject_type='Export' and w.subject_id=e.id",
        [workflowId],
      );
      const exportRecord = exportResult.rows[0];
      if (!exportRecord) throw new Error("portable export is unavailable");
      const snapshotResult = await client.query<{ snapshot: unknown }>(`
        select jsonb_build_object(
          'format','legacy-vault-household-snapshot/v1',
          'people',coalesce((select jsonb_agg(to_jsonb(p)-'organization_id'-'household_id' order by p.id) from people p),'[]'::jsonb),
          'memberships',coalesce((select jsonb_agg(to_jsonb(m)-'organization_id'-'household_id'-'auth_user_id' order by m.id) from memberships m),'[]'::jsonb),
          'permissionGrants',coalesce((select jsonb_agg(to_jsonb(g)-'organization_id'-'household_id' order by g.id) from permission_grants g),'[]'::jsonb),
          'facts',coalesce((select jsonb_agg(to_jsonb(f)-'organization_id'-'household_id' order by f.id) from facts f),'[]'::jsonb),
          'consents',coalesce((select jsonb_agg(to_jsonb(c)-'organization_id'-'household_id' order by c.id) from consents c),'[]'::jsonb),
          'emergencyAccess',coalesce((select jsonb_agg(to_jsonb(e)-'organization_id'-'household_id' order by e.id) from emergency_access_requests e),'[]'::jsonb),
          'reports',coalesce((select jsonb_agg(to_jsonb(r)-'organization_id'-'household_id' order by r.id) from reports r),'[]'::jsonb),
          'privacyRequests',coalesce((select jsonb_agg(to_jsonb(pr)-'organization_id'-'household_id' order by pr.id) from privacy_requests pr),'[]'::jsonb),
          'subscription',coalesce((select jsonb_agg(to_jsonb(s)-'organization_id'-'household_id'-'provider_customer_id'-'provider_subscription_id' order by s.id) from subscriptions s),'[]'::jsonb)
        ) as snapshot
      `);
      const documentResult = await client.query<{
        id: string;
        object_key: string;
        media_type: string;
        encryption_key_version: number;
      }>(
        "select id,object_key,media_type,encryption_key_version from documents where status='clean' order by id",
      );
      return {
        exportId: exportRecord.id,
        workflowId: exportRecord.workflow_id,
        status: exportRecord.status,
        createdAt: exportRecord.created_at.toISOString(),
        wrappedExportKey: exportRecord.wrapped_export_key,
        encryptionKeyVersion: exportRecord.encryption_key_version,
        snapshot: snapshotResult.rows[0]?.snapshot ?? {},
        documents: documentResult.rows.map((document) => ({
          id: document.id,
          objectKey: document.object_key,
          mediaType: document.media_type,
          encryptionKeyVersion: document.encryption_key_version,
        })),
      };
    });
  }

  async getPortableExport(
    context: TenantContext,
    exportId: string,
  ): Promise<PortableExportReadModel | null> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        status: string;
        object_key: string | null;
        archive_sha256: string | null;
        signer_public_key: string | null;
        created_at: Date;
        completed_at: Date | null;
        version: number;
      }>(
        "select id,status,object_key,archive_sha256,signer_public_key,created_at,completed_at,version from exports where id=$1",
        [exportId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        objectKey: row.object_key,
        archiveSha256: row.archive_sha256,
        signerPublicKey: row.signer_public_key,
        createdAt: row.created_at.toISOString(),
        completedAt: row.completed_at?.toISOString() ?? null,
        version: row.version,
      };
    });
  }

  async completePortableExport(
    context: TenantContext,
    input: {
      exportId: string;
      workflowId: string;
      objectKey: string;
      archiveSha256: string;
      signerPublicKey: string;
      completedAt: string;
    },
  ): Promise<void> {
    await this.withTenant(context, async (client) => {
      const completed = await client.query(
        "update exports set status='completed',object_key=$1,archive_sha256=$2,signer_public_key=$3,completed_at=$4,version=version+1 where id=$5 and workflow_id=$6 and status<>'completed'",
        [
          input.objectKey,
          input.archiveSha256,
          input.signerPublicKey,
          input.completedAt,
          input.exportId,
          input.workflowId,
        ],
      );
      if (completed.rowCount === 0) {
        const existing = await client.query(
          "select 1 from exports where id=$1 and workflow_id=$2 and status='completed' and object_key=$3 and archive_sha256=$4",
          [
            input.exportId,
            input.workflowId,
            input.objectKey,
            input.archiveSha256,
          ],
        );
        if (existing.rowCount !== 1)
          throw new Error("portable export completion conflict");
      }
      await client.query(
        "update workflow_runs set status='completed',completed_steps='[\"snapshot\",\"archive\",\"store\"]',next_step=null,version=version+1 where id=$1 and status<>'completed'",
        [input.workflowId],
      );
    });
  }

  async reserveIdempotency(
    context: TenantContext,
    key: string,
    request: unknown,
  ): Promise<{ replay: boolean; statusCode?: number; responseBody?: unknown }> {
    return this.withTenant(context, async (client) => {
      const requestHash = createHash("sha256")
        .update(JSON.stringify(request))
        .digest("hex");
      const inserted = await client.query(
        "insert into idempotency_records(organization_id,household_id,idempotency_key,request_hash,expires_at) values ($1,$2,$3,$4,now()+interval '24 hours') on conflict do nothing",
        [context.organizationId, context.householdId, key, requestHash],
      );
      if (inserted.rowCount === 1) return { replay: false };
      const existing = await client.query<{
        request_hash: string;
        status_code: number | null;
        response_body: unknown;
      }>(
        "select request_hash,status_code,response_body from idempotency_records where organization_id=$1 and household_id=$2 and idempotency_key=$3",
        [context.organizationId, context.householdId, key],
      );
      const row = existing.rows[0];
      if (!row || row.request_hash !== requestHash)
        throw new Error("idempotency key reused with different request");
      return {
        replay: true,
        ...(row.status_code === null
          ? {}
          : { statusCode: row.status_code, responseBody: row.response_body }),
      };
    });
  }

  async completeIdempotency(
    context: TenantContext,
    key: string,
    statusCode: number,
    responseBody: unknown,
  ): Promise<void> {
    await this.withTenant(context, async (client) => {
      await client.query(
        "update idempotency_records set status_code=$1,response_body=$2 where organization_id=$3 and household_id=$4 and idempotency_key=$5 and status_code is null",
        [
          statusCode,
          JSON.stringify(responseBody),
          context.organizationId,
          context.householdId,
          key,
        ],
      );
    });
  }
}
