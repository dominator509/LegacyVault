import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNotificationWorkflowHandler } from "../../apps/worker/src/index.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { VaultRepository } from "../../packages/database/src/repository.js";
import { LocalSmtpCaptureAdapter } from "../../packages/notifications/src/index.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const databaseUrl = readLocalEnvironment().TEST_DATABASE_URL ?? "";
const repository = new VaultRepository(databaseUrl);

beforeAll(async () => runMigrations(databaseUrl));
afterAll(async () => repository.close());

describe("annual review notification workflow", () => {
  it("delivers one consented notification through real local SMTP and persists provider evidence", async () => {
    const context = {
      organizationId: randomUUID(),
      householdId: randomUUID(),
      actorId: randomUUID(),
    };
    const membershipId = randomUUID();
    const authUserId = randomUUID();
    const recipientEmail = `annual-review-${randomUUID()}@example.test`;
    const client = createDatabaseClient(databaseUrl);
    await client.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.organization_id',$1,true)", [
        context.organizationId,
      ]);
      await client.query("insert into organizations(id,name) values ($1,$2)", [
        context.organizationId,
        "Notification Organization",
      ]);
      await client.query("select set_config('app.household_id',$1,true)", [
        context.householdId,
      ]);
      await client.query(
        "insert into households(id,organization_id,name) values ($1,$2,$3)",
        [context.householdId, context.organizationId, "Notification Household"],
      );
      await client.query(
        'insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values ($1,$2,$3,true,now(),now())',
        [authUserId, "Notification Recipient", recipientEmail],
      );
      await client.query(
        "insert into people(id,organization_id,household_id,display_name_encrypted,key_version) values ($1,$2,$3,$4,1)",
        [
          context.actorId,
          context.organizationId,
          context.householdId,
          Buffer.from("encrypted-recipient"),
        ],
      );
      await client.query(
        "insert into memberships(id,organization_id,household_id,person_id,role,auth_user_id,active) values ($1,$2,$3,$4,'Owner',$5,1)",
        [
          membershipId,
          context.organizationId,
          context.householdId,
          context.actorId,
          authUserId,
        ],
      );
      await client.query(
        "insert into consents(id,organization_id,household_id,person_id,purpose,policy_version,granted_at) values ($1,$2,$3,$4,'transactional-email','email-notice-v1',now())",
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

    const started = await repository.startReport(context, {
      idempotencyKey: `annual-notification-${randomUUID()}`,
      kind: "annual-review",
      requestedAt: "2026-08-06T00:00:00.000Z",
    });
    await repository.completeReport(context, {
      reportId: started.report.id,
      workflowId: started.workflow.id,
      generatedAt: "2026-08-06T00:01:00.000Z",
      payloadEncrypted: Buffer.from("encrypted-report-payload"),
      encryptionKeyVersion: 1,
    });
    const handler = createNotificationWorkflowHandler({
      repository,
      email: new LocalSmtpCaptureAdapter({
        host: "127.0.0.1",
        port: 1025,
        from: "notices@localhost.invalid",
        timeoutMs: 5_000,
      }),
      appBaseUrl: "http://127.0.0.1:3000",
      now: () => new Date("2026-08-06T00:02:00.000Z"),
    });
    const job = { workflowId: started.workflow.id, ...context };
    await handler(job);
    await handler(job);

    const verify = createDatabaseClient(databaseUrl);
    await verify.connect();
    try {
      await verify.query("begin");
      await verify.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [context.organizationId, context.householdId],
      );
      const delivery = await verify.query<{
        status: string;
        attempt_count: number;
        provider_message_id: string;
        sent_at: Date;
      }>(
        "select status,attempt_count,provider_message_id,sent_at from notification_deliveries where workflow_id=$1",
        [started.workflow.id],
      );
      await verify.query("commit");
      expect(delivery.rows[0]).toMatchObject({
        status: "sent",
        attempt_count: 1,
      });
      expect(delivery.rows[0]?.provider_message_id).toContain(
        "@legacy-vault.local",
      );
      expect(delivery.rows[0]?.sent_at.toISOString()).toBe(
        "2026-08-06T00:02:00.000Z",
      );
    } finally {
      await verify.end();
    }

    const messages = await fetch("http://127.0.0.1:8025/api/v1/messages");
    const body = (await messages.json()) as {
      messages?: { ID: string; Subject: string; To: { Address: string }[] }[];
    };
    const captured = body.messages?.find((message) =>
      message.To.some((entry) => entry.Address === recipientEmail),
    );
    expect(captured?.Subject).toBe("Your Legacy Vault annual review is ready");
    const text = await fetch(`http://127.0.0.1:8025/view/${captured?.ID}.txt`);
    await expect(text.text()).resolves.toContain(
      `/reports/${started.report.id}`,
    );

    const withdraw = createDatabaseClient(databaseUrl);
    await withdraw.connect();
    try {
      await withdraw.query("begin");
      await withdraw.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [context.organizationId, context.householdId],
      );
      await withdraw.query(
        "update consents set withdrawn_at='2026-08-06T00:03:00Z',version=version+1 where person_id=$1 and purpose='transactional-email'",
        [context.actorId],
      );
      await withdraw.query("commit");
    } finally {
      await withdraw.end();
    }
    const unconsented = await repository.startReport(context, {
      idempotencyKey: `annual-no-notification-${randomUUID()}`,
      kind: "annual-review",
      requestedAt: "2026-08-06T00:04:00.000Z",
    });
    await repository.completeReport(context, {
      reportId: unconsented.report.id,
      workflowId: unconsented.workflow.id,
      generatedAt: "2026-08-06T00:05:00.000Z",
      payloadEncrypted: Buffer.from("second-encrypted-report"),
      encryptionKeyVersion: 1,
    });
    await handler({ workflowId: unconsented.workflow.id, ...context });
    const unconsentedDelivery = await repository.getNotificationDeliveryInput(
      context,
      unconsented.workflow.id,
    );
    expect(unconsentedDelivery).toBeNull();
  }, 20_000);
});
