import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  encryptEnvelope,
  decryptEnvelope,
  PostgresHouseholdKeyStore,
} from "../../packages/crypto/src/index.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const local = readLocalEnvironment();
const databaseUrl = local.TEST_DATABASE_URL ?? "";
const keyEncryptionKey = Buffer.from(local.APP_ENCRYPTION_KEK ?? "", "base64");
const organizationId = randomUUID();
const householdId = randomUUID();
const store = new PostgresHouseholdKeyStore(databaseUrl, keyEncryptionKey);

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
      "Household Key Organization",
    ]);
    await client.query("select set_config('app.household_id',$1,true)", [
      householdId,
    ]);
    await client.query(
      "insert into households(id,organization_id,name) values ($1,$2,$3)",
      [householdId, organizationId, "Household Key Household"],
    );
    await client.query("commit");
  } finally {
    await client.end();
  }
});

afterAll(async () => store.close());

describe("tenant household key persistence", () => {
  it("serializes concurrent creation and unwraps the same active DEK", async () => {
    const context = { organizationId, householdId };
    const [first, second] = await Promise.all([
      store.getOrCreateActiveKey(context),
      store.getOrCreateActiveKey(context),
    ]);
    expect(first.keyVersion).toBe(1);
    expect(second.keyVersion).toBe(1);
    expect(Buffer.from(first.plaintextKey)).toEqual(
      Buffer.from(second.plaintextKey),
    );
    const encryptionContext = {
      ...context,
      recordId: randomUUID(),
      purpose: "fact-value",
      keyVersion: first.keyVersion,
    };
    const envelope = encryptEnvelope(
      Buffer.from('{"carrier":"Example Mutual"}'),
      first.plaintextKey,
      encryptionContext,
    );
    expect(
      Buffer.from(
        decryptEnvelope(envelope, second.plaintextKey, encryptionContext),
      ).toString("utf8"),
    ).toBe('{"carrier":"Example Mutual"}');

    const client = createDatabaseClient(databaseUrl);
    await client.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [organizationId, householdId],
      );
      const count = await client.query<{ count: number }>(
        "select count(*)::int as count from household_keys where status='active'",
      );
      await client.query("commit");
      expect(count.rows[0]?.count).toBe(1);
    } finally {
      await client.end();
    }
    first.plaintextKey.fill(0);
    second.plaintextKey.fill(0);
  });
});
