import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { createDatabasePool } from "./client.js";

export interface TenantContext {
  organizationId: string;
  householdId: string;
  actorId: string;
}
export interface CandidateFactWrite {
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
      const id = randomUUID();
      const result = await client.query<{
        id: string;
        status: "candidate";
        version: number;
      }>(
        "insert into facts(id, organization_id, household_id, field_key, typed_value_encrypted, key_version, status, source_type, source_id, evidence_ids, confidence, sensitivity) values ($1,$2,$3,$4,$5,$6,'candidate',$7,$8,$9,$10,$11) returning id,status,version",
        [
          id,
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
