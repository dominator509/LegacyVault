import pg from "pg";
import {
  createAuditEvent,
  pseudonymizeIdentifier,
  verifyAuditChain,
  type ChainedAuditEvent,
} from "./index.js";

export interface AuditTenantContext {
  organizationId: string;
  householdId: string;
}

export class PostgresAuditStore {
  readonly #pool: pg.Pool;
  constructor(
    databaseUrl: string,
    private readonly auditKey: Uint8Array,
  ) {
    this.#pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      application_name: "legacy-vault-audit",
    });
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async append(
    context: AuditTenantContext,
    input: {
      id: string;
      occurredAt: string;
      actorId: string;
      action: string;
      outcome: string;
      metadata: Readonly<Record<string, string | number | boolean | null>>;
    },
  ): Promise<ChainedAuditEvent> {
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [context.organizationId, context.householdId],
      );
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1,0))",
        [context.householdId],
      );
      const previous = await client.query<{
        sequence: number;
        event_hash: string;
      }>(
        "select sequence,event_hash from audit_events order by sequence desc limit 1",
      );
      const event = createAuditEvent(
        {
          organizationId: context.organizationId,
          householdId: context.householdId,
          sequence: (previous.rows[0]?.sequence ?? 0) + 1,
          occurredAt: input.occurredAt,
          actorPseudonym: pseudonymizeIdentifier(input.actorId, this.auditKey),
          action: input.action,
          outcome: input.outcome,
          metadata: input.metadata,
          previousHash: previous.rows[0]?.event_hash ?? "GENESIS",
        },
        this.auditKey,
      );
      await client.query(
        "insert into audit_events(id,organization_id,household_id,sequence,occurred_at,actor_pseudonym,action,outcome,metadata,previous_hash,event_hash) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          input.id,
          event.organizationId,
          event.householdId,
          event.sequence,
          event.occurredAt,
          event.actorPseudonym,
          event.action,
          event.outcome,
          JSON.stringify(event.metadata),
          event.previousHash,
          event.eventHash,
        ],
      );
      await client.query("commit");
      return event;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async verify(context: AuditTenantContext): Promise<boolean> {
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [context.organizationId, context.householdId],
      );
      const result = await client.query<{
        organization_id: string;
        household_id: string;
        sequence: number;
        occurred_at: Date;
        actor_pseudonym: string;
        action: string;
        outcome: string;
        metadata: Record<string, string | number | boolean | null>;
        previous_hash: string;
        event_hash: string;
      }>("select * from audit_events order by sequence");
      await client.query("commit");
      return verifyAuditChain(
        result.rows.map((row) => ({
          organizationId: row.organization_id,
          householdId: row.household_id,
          sequence: row.sequence,
          occurredAt: row.occurred_at.toISOString(),
          actorPseudonym: row.actor_pseudonym,
          action: row.action,
          outcome: row.outcome,
          metadata: row.metadata,
          previousHash: row.previous_hash,
          eventHash: row.event_hash,
        })),
        this.auditKey,
      );
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
