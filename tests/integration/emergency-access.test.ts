import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { VaultRepository } from "../../packages/database/src/repository.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const databaseUrl = readLocalEnvironment().TEST_DATABASE_URL ?? "";

beforeAll(async () => runMigrations(databaseUrl));

describe("compartmentalized emergency access lifecycle", () => {
  it("requires the recipient membership, an owner decision, and elapsed delay before release", async () => {
    const organizationId = randomUUID();
    const householdId = randomUUID();
    const ownerId = randomUUID();
    const recipientId = randomUUID();
    const recipientMembershipId = randomUUID();
    const client = createDatabaseClient(databaseUrl);
    await client.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.organization_id',$1,true)", [
        organizationId,
      ]);
      await client.query("insert into organizations(id,name) values ($1,$2)", [
        organizationId,
        "Emergency Organization",
      ]);
      await client.query("select set_config('app.household_id',$1,true)", [
        householdId,
      ]);
      await client.query(
        "insert into households(id,organization_id,name) values ($1,$2,$3)",
        [householdId, organizationId, "Emergency Household"],
      );
      for (const personId of [ownerId, recipientId])
        await client.query(
          "insert into people(id,organization_id,household_id,display_name_encrypted,key_version) values ($1,$2,$3,$4,1)",
          [personId, organizationId, householdId, Buffer.from("encrypted")],
        );
      await client.query(
        "insert into memberships(id,organization_id,household_id,person_id,role,active) values ($1,$2,$3,$4,'EmergencyRecipient',1)",
        [recipientMembershipId, organizationId, householdId, recipientId],
      );
      await client.query("commit");
    } finally {
      await client.end();
    }
    const repository = new VaultRepository(databaseUrl);
    const recipient = { organizationId, householdId, actorId: recipientId };
    const owner = { organizationId, householdId, actorId: ownerId };
    try {
      const requestId = randomUUID();
      const created = await repository.createEmergencyAccessRequest(recipient, {
        id: requestId,
        recipientMembershipId,
        categories: ["insurance"],
        reasonEncrypted: Buffer.from("ciphertext-only"),
        keyVersion: 1,
        requestedAt: "2026-08-06T00:00:00.000Z",
      });
      expect(created).toMatchObject({ status: "requested", version: 1 });
      const delayed = await repository.decideEmergencyAccess(owner, {
        requestId,
        expectedVersion: 1,
        decision: "delay",
        decisionAt: "2026-08-06T00:01:00.000Z",
        releaseAfter: "2026-08-06T01:01:00.000Z",
      });
      expect(delayed).toMatchObject({ status: "delayed", version: 2 });
      await expect(
        repository.releaseEmergencyAccess(owner, {
          requestId,
          expectedVersion: 2,
          releasedAt: "2026-08-06T00:30:00.000Z",
        }),
      ).rejects.toThrow(/delay active/);
      await expect(
        repository.releaseEmergencyAccess(owner, {
          requestId,
          expectedVersion: 2,
          releasedAt: "2026-08-06T01:01:00.000Z",
        }),
      ).resolves.toMatchObject({ status: "released", version: 3 });
      await expect(
        repository.getEmergencyAccessCategories(
          { organizationId: randomUUID(), householdId, actorId: ownerId },
          requestId,
        ),
      ).rejects.toThrow("emergency access request is unavailable");
    } finally {
      await repository.close();
    }
  });
});
