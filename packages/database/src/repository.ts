import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { createDatabasePool } from "./client.js";

export interface TenantContext {
  organizationId: string;
  householdId: string;
  actorId: string;
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
export type PrivacyRequestKind =
  "access" | "correction" | "export" | "deletion" | "appeal";

export interface StartedPortableExport {
  export: { id: string; status: string; version: number };
  workflow: { id: string; status: string; version: number };
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
  confirmedBy: string;
  confirmedAt: string;
  version: number;
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
}
export interface StartedDocumentProcessing {
  document: { id: string; status: string; version: number };
  workflow: { id: string; status: string; version: number };
}
export interface DocumentProcessingInput extends DocumentUploadRecord {
  workflowId: string;
  workflowStatus: string;
  workflowVersion: number;
  nextStep: string | null;
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

  async listConfirmedFactsForReport(
    context: TenantContext,
  ): Promise<EncryptedFactForReport[]> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        field_key: string;
        typed_value_encrypted: Buffer;
        key_version: number;
        source_type: string;
        source_id: string;
        evidence_ids: string[];
        confidence: string | null;
        sensitivity: string;
        confirmed_by: string;
        confirmed_at: Date;
        version: number;
      }>(
        "select id,field_key,typed_value_encrypted,key_version,source_type,source_id,evidence_ids,confidence,sensitivity,confirmed_by,confirmed_at,version from facts where status='confirmed' order by field_key,id",
      );
      return result.rows.map((row) => ({
        id: row.id,
        fieldKey: row.field_key,
        ciphertext: new Uint8Array(row.typed_value_encrypted),
        keyVersion: row.key_version,
        sourceType: row.source_type,
        sourceId: row.source_id,
        evidenceIds: row.evidence_ids,
        ...(row.confidence === null
          ? {}
          : { confidence: Number(row.confidence) }),
        sensitivity: row.sensitivity,
        confirmedBy: row.confirmed_by,
        confirmedAt: row.confirmed_at.toISOString(),
        version: row.version,
      }));
    });
  }

  async persistReport(
    context: TenantContext,
    input: {
      id: string;
      kind: string;
      generatedAt: string;
      claims: unknown;
      sourceFactVersions: unknown;
    },
  ): Promise<{ id: string; kind: string; version: number }> {
    return this.withTenant(context, async (client) => {
      const result = await client.query<{
        id: string;
        kind: string;
        version: number;
      }>(
        "insert into reports(id,organization_id,household_id,kind,generated_at,claims,source_fact_versions) values ($1,$2,$3,$4,$5,$6,$7) returning id,kind,version",
        [
          input.id,
          context.organizationId,
          context.householdId,
          input.kind,
          input.generatedAt,
          JSON.stringify(input.claims),
          JSON.stringify(input.sourceFactVersions),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("report was not persisted");
      return row;
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
    },
  ): Promise<DocumentUploadRecord> {
    return this.withTenant(context, async (client) => {
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            originalSha256: input.originalSha256,
            mediaType: input.mediaType,
            maximumBytes: input.maximumBytes,
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
          "insert into documents(id,organization_id,household_id,object_key,original_sha256,media_type,status,encryption_key_version,wrapped_data_key,maximum_bytes) values ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9)",
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
      }>(
        "select id,object_key,original_sha256,media_type,status,encryption_key_version,wrapped_data_key,maximum_bytes,version from documents where id=$1",
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
      }>(
        "select id,object_key,original_sha256,media_type,status,encryption_key_version,wrapped_data_key,maximum_bytes,version from documents where id=$1 and status='pending'",
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
        workflow_id: string;
        workflow_status: string;
        workflow_version: number;
        next_step: string | null;
      }>(
        "select d.id,d.object_key,d.original_sha256,d.media_type,d.status,d.encryption_key_version,d.wrapped_data_key,d.maximum_bytes,d.version,w.id as workflow_id,w.status as workflow_status,w.version as workflow_version,w.next_step from documents d join workflow_runs w on w.subject_type='Document' and w.subject_id=d.id where w.id=$1",
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
        const workflowResult = await client.query<{
          id: string;
          status: string;
          version: number;
        }>(
          "insert into workflow_runs(id,organization_id,household_id,kind,idempotency_key,status,completed_steps,next_step) values ($1,$2,$3,$4,$5,'pending','[]','identity-verification') returning id,status,version",
          [
            randomUUID(),
            context.organizationId,
            context.householdId,
            input.kind,
            `privacy:${privacyId}`,
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
