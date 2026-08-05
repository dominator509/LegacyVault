import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const local = readLocalEnvironment();
const testDatabaseUrl = local.TEST_DATABASE_URL ?? "";

beforeAll(async () => {
  await runMigrations(testDatabaseUrl);
});

describe("PostgreSQL tenant isolation and integrity", () => {
  it("forces organization and household RLS for authoritative facts", async () => {
    const client = createDatabaseClient(testDatabaseUrl);
    await client.connect();
    const organizationId = randomUUID();
    const householdId = randomUUID();
    const factId = randomUUID();
    try {
      await client.query("begin");
      await client.query("select set_config('app.organization_id', $1, true)", [
        organizationId,
      ]);
      await client.query(
        "insert into organizations(id, name) values ($1, $2)",
        [organizationId, "Test Organization"],
      );
      await client.query("select set_config('app.household_id', $1, true)", [
        householdId,
      ]);
      await client.query(
        "insert into households(id, organization_id, name) values ($1, $2, $3)",
        [householdId, organizationId, "Test Household"],
      );
      await client.query(
        "insert into facts(id, organization_id, household_id, field_key, typed_value_encrypted, key_version, status, source_type, source_id, evidence_ids, sensitivity) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          factId,
          organizationId,
          householdId,
          "property.address",
          Buffer.from("ciphertext"),
          1,
          "candidate",
          "manual",
          randomUUID(),
          "[]",
          "sensitive",
        ],
      );
      expect(
        (await client.query("select count(*)::int as count from facts")).rows[0]
          ?.count,
      ).toBe(1);

      await client.query("select set_config('app.organization_id', $1, true)", [
        randomUUID(),
      ]);
      await client.query("select set_config('app.household_id', $1, true)", [
        randomUUID(),
      ]);
      expect(
        (await client.query("select count(*)::int as count from facts")).rows[0]
          ?.count,
      ).toBe(0);
      await client.query("rollback");
    } finally {
      await client.end();
    }
  });

  it("has no plaintext authoritative fact value column", async () => {
    const client = createDatabaseClient(testDatabaseUrl);
    await client.connect();
    try {
      const columns = await client.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'facts'",
      );
      const names = columns.rows.map((row) => row.column_name);
      expect(names).toContain("typed_value_encrypted");
      expect(names).not.toContain("typed_value");
    } finally {
      await client.end();
    }
  });

  it("rejects confirmed facts without actor and timestamp", async () => {
    const client = createDatabaseClient(testDatabaseUrl);
    await client.connect();
    const organizationId = randomUUID();
    const householdId = randomUUID();
    try {
      await client.query("begin");
      await client.query("select set_config('app.organization_id', $1, true)", [
        organizationId,
      ]);
      await client.query(
        "insert into organizations(id, name) values ($1, $2)",
        [organizationId, "Constraint Organization"],
      );
      await client.query("select set_config('app.household_id', $1, true)", [
        householdId,
      ]);
      await client.query(
        "insert into households(id, organization_id, name) values ($1, $2, $3)",
        [householdId, organizationId, "Constraint Household"],
      );
      await expect(
        client.query(
          "insert into facts(id, organization_id, household_id, field_key, typed_value_encrypted, key_version, status, source_type, source_id, evidence_ids, sensitivity) values ($1,$2,$3,$4,$5,$6,'confirmed','manual',$7,'[]','standard')",
          [
            randomUUID(),
            organizationId,
            householdId,
            "test",
            Buffer.from("ciphertext"),
            1,
            randomUUID(),
          ],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback");
    } finally {
      await client.end();
    }
  });
});
