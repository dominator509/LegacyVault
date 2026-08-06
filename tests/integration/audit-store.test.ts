import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAuditStore } from "../../packages/audit/src/index.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const databaseUrl = readLocalEnvironment().TEST_DATABASE_URL ?? "";
const organizationId = randomUUID();
const householdId = randomUUID();
const store = new PostgresAuditStore(databaseUrl, randomBytes(32));

beforeAll(async () => {
  await runMigrations(databaseUrl);
  const client = createDatabaseClient(databaseUrl);
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.organization_id',$1,true)", [
      organizationId,
    ]);
    await client.query("insert into organizations(id,name) values ($1,$2)", [
      organizationId,
      "Audit Test Organization",
    ]);
    await client.query("select set_config('app.household_id',$1,true)", [
      householdId,
    ]);
    await client.query(
      "insert into households(id,organization_id,name) values ($1,$2,$3)",
      [householdId, organizationId, "Audit Test Household"],
    );
    await client.query("commit");
  } finally {
    await client.end();
  }
});

afterAll(async () => store.close());

describe("real append-only PostgreSQL audit chain", () => {
  it("serializes and verifies events and rejects database mutation", async () => {
    const context = { organizationId, householdId };
    const first = await store.append(context, {
      id: randomUUID(),
      occurredAt: "2026-08-05T20:00:00.000Z",
      actorId: randomUUID(),
      action: "fact.confirm",
      outcome: "allowed",
      metadata: { category: "insurance" },
    });
    const second = await store.append(context, {
      id: randomUUID(),
      occurredAt: "2026-08-05T20:01:00.000Z",
      actorId: randomUUID(),
      action: "report.generate",
      outcome: "allowed",
      metadata: { report_kind: "emergency-guide" },
    });
    expect(first.sequence).toBe(1);
    expect(second.previousHash).toBe(first.eventHash);
    await expect(store.verify(context)).resolves.toBe(true);
    await expect(
      store.readVerified(context, { afterSequence: 0, limit: 1 }),
    ).resolves.toEqual({
      events: [first],
      nextSequence: 1,
    });
    await expect(
      store.readVerified(context, { afterSequence: 1, limit: 100 }),
    ).resolves.toEqual({ events: [second], nextSequence: null });

    const client = createDatabaseClient(databaseUrl);
    await client.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [organizationId, householdId],
      );
      await expect(
        client.query(
          "update audit_events set outcome='changed' where sequence=1",
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await client.query("rollback");
    } finally {
      await client.end();
    }
  });
});
