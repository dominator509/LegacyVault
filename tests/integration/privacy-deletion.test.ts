import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrivacyDeletionWorkflowHandler } from "../../apps/worker/src/index.js";
import { aiCacheScopeKey } from "../../packages/ai-gateway/src/index.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { VaultRepository } from "../../packages/database/src/repository.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const databaseUrl = readLocalEnvironment().TEST_DATABASE_URL ?? "";
const repository = new VaultRepository(databaseUrl);

beforeAll(async () => runMigrations(databaseUrl));
afterAll(async () => repository.close());

async function seedDeletionTenant() {
  const context = {
    organizationId: randomUUID(),
    householdId: randomUUID(),
    actorId: randomUUID(),
  };
  const membershipId = randomUUID();
  const client = createDatabaseClient(databaseUrl);
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.organization_id',$1,true)", [
      context.organizationId,
    ]);
    await client.query("insert into organizations(id,name) values ($1,$2)", [
      context.organizationId,
      "Deletion Test Organization",
    ]);
    await client.query("select set_config('app.household_id',$1,true)", [
      context.householdId,
    ]);
    await client.query(
      "insert into households(id,organization_id,name) values ($1,$2,$3)",
      [context.householdId, context.organizationId, "Deletion Test Household"],
    );
    await client.query(
      "insert into people(id,organization_id,household_id,display_name_encrypted,key_version) values ($1,$2,$3,$4,1)",
      [
        context.actorId,
        context.organizationId,
        context.householdId,
        Buffer.from("encrypted-deletion-subject"),
      ],
    );
    await client.query(
      "insert into memberships(id,organization_id,household_id,person_id,role,active) values ($1,$2,$3,$4,'Owner',1)",
      [
        membershipId,
        context.organizationId,
        context.householdId,
        context.actorId,
      ],
    );
    await client.query(
      "insert into permission_grants(id,organization_id,household_id,membership_id,categories,actions,purpose,starts_at) values ($1,$2,$3,$4,'[\"insurance\"]','[\"read\"]','test',now())",
      [randomUUID(), context.organizationId, context.householdId, membershipId],
    );
    await client.query(
      "insert into consents(id,organization_id,household_id,person_id,purpose,policy_version,granted_at) values ($1,$2,$3,$4,'terms','terms-test',now())",
      [
        randomUUID(),
        context.organizationId,
        context.householdId,
        context.actorId,
      ],
    );
    await client.query("commit");
  } finally {
    await client.end();
  }
  const started = await repository.startPrivacyRequest(context, {
    personId: context.actorId,
    kind: "deletion",
    idempotencyKey: `delete-${randomUUID()}`,
    requestedAt: "2026-01-01T00:00:00.000Z",
  });
  const confirmed = await repository.confirmPrivacyDeletion(context, {
    requestId: started.privacyRequest.id,
    expectedVersion: started.privacyRequest.version,
    idempotencyKey: `confirm-${randomUUID()}`,
    confirmedAt: "2026-01-01T00:00:00.000Z",
    recoveryDays: 30,
  });
  return { context, membershipId, started, confirmed };
}

describe("verifiable privacy deletion", () => {
  it("refuses active-system deletion before the recovery period elapses", async () => {
    const seeded = await seedDeletionTenant();
    const handler = createPrivacyDeletionWorkflowHandler({
      repository,
      purgeAiCache: async () => undefined,
      backupRetentionDays: 35,
      now: () => new Date("2026-01-15T00:00:00.000Z"),
    });
    await expect(
      handler({
        workflowId: seeded.confirmed.workflow.id,
        ...seeded.context,
      }),
    ).rejects.toThrow(/recovery period/);
    const deletion = await repository.getPrivacyDeletionInput(
      seeded.context,
      seeded.confirmed.workflow.id,
    );
    expect(deletion.status).toBe("recovery-period");
  });

  it("removes attributable account access after recovery and retains only explicit evidence pending review", async () => {
    const seeded = await seedDeletionTenant();
    const purgedScopes: string[] = [];
    const handler = createPrivacyDeletionWorkflowHandler({
      repository,
      purgeAiCache: async (scopeKey) => {
        purgedScopes.push(scopeKey);
      },
      backupRetentionDays: 35,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });
    await handler({
      workflowId: seeded.confirmed.workflow.id,
      ...seeded.context,
    });
    expect(purgedScopes).toEqual([
      aiCacheScopeKey(
        seeded.context.organizationId,
        seeded.context.householdId,
      ),
    ]);

    const client = createDatabaseClient(databaseUrl);
    await client.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [seeded.context.organizationId, seeded.context.householdId],
      );
      const result = await client.query<{
        execution_status: string;
        request_status: string;
        workflow_status: string;
        next_step: string;
        backup_expires_at: Date;
        retained_categories: string[];
        person_count: string;
        membership_active: number;
        grant_revoked_at: Date | null;
        consent_count: string;
        processor_count: string;
      }>(
        `
        select
          de.status as execution_status,
          pr.status as request_status,
          w.status as workflow_status,
          w.next_step,
          de.backup_expires_at,
          de.retained_categories,
          (select count(*) from people where id=de.person_id)::text as person_count,
          (select active from memberships where id=$2) as membership_active,
          (select revoked_at from permission_grants where membership_id=$2 limit 1) as grant_revoked_at,
          (select count(*) from consents where person_id=de.person_id)::text as consent_count,
          (select count(*) from deletion_processor_requests where workflow_id=w.id and status='verification-required')::text as processor_count
        from deletion_executions de
        join privacy_requests pr on pr.id=de.privacy_request_id
        join workflow_runs w on w.id=de.workflow_id
        where de.id=$1
      `,
        [seeded.confirmed.execution.id, seeded.membershipId],
      );
      await client.query("commit");
      expect(result.rows[0]).toMatchObject({
        execution_status: "awaiting-review",
        request_status: "awaiting-review",
        workflow_status: "running",
        next_step: "shared-data-review",
        person_count: "0",
        membership_active: 0,
        consent_count: "1",
        processor_count: "4",
      });
      expect(result.rows[0]?.grant_revoked_at).toBeInstanceOf(Date);
      expect(result.rows[0]?.backup_expires_at.toISOString()).toBe(
        "2026-03-08T00:00:00.000Z",
      );
      expect(result.rows[0]?.retained_categories).toEqual([
        "audit-events",
        "billing-records",
        "consent-acceptance",
        "privacy-request-evidence",
      ]);
    } finally {
      await client.end();
    }
  });

  it("fails closed before destructive state when AI cache purge fails", async () => {
    const seeded = await seedDeletionTenant();
    const handler = createPrivacyDeletionWorkflowHandler({
      repository,
      purgeAiCache: async () => {
        throw new Error("cache purge unavailable");
      },
      backupRetentionDays: 35,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });
    await expect(
      handler({
        workflowId: seeded.confirmed.workflow.id,
        ...seeded.context,
      }),
    ).rejects.toThrow("cache purge unavailable");
    const deletion = await repository.getPrivacyDeletionInput(
      seeded.context,
      seeded.confirmed.workflow.id,
    );
    expect(deletion.status).toBe("recovery-period");
  });

  it("blocks destructive work when an applicable legal hold is active", async () => {
    const seeded = await seedDeletionTenant();
    const client = createDatabaseClient(databaseUrl);
    await client.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [seeded.context.organizationId, seeded.context.householdId],
      );
      await client.query(
        "insert into legal_holds(id,organization_id,household_id,category,subject_type,subject_id,reason_code,starts_at,created_by) values ($1,$2,$3,'original-documents','Person',$4,'test-hold','2026-01-15T00:00:00Z',$4)",
        [
          randomUUID(),
          seeded.context.organizationId,
          seeded.context.householdId,
          seeded.context.actorId,
        ],
      );
      await client.query("commit");
    } finally {
      await client.end();
    }
    const handler = createPrivacyDeletionWorkflowHandler({
      repository,
      purgeAiCache: async () => undefined,
      backupRetentionDays: 35,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });
    await handler({
      workflowId: seeded.confirmed.workflow.id,
      ...seeded.context,
    });
    const deletion = await repository.getPrivacyDeletionInput(
      seeded.context,
      seeded.confirmed.workflow.id,
    );
    expect(deletion.status).toBe("blocked-legal-hold");
    expect(deletion.legalHoldCategories).toEqual(["original-documents"]);
  });
});
