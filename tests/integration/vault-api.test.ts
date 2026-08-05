import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import {
  VaultRepository,
  type TenantContext,
} from "../../packages/database/src/repository.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const local = readLocalEnvironment();
const databaseUrl = local.TEST_DATABASE_URL ?? "";
const identity: TenantContext = {
  organizationId: randomUUID(),
  householdId: randomUUID(),
  actorId: randomUUID(),
};
const repository = new VaultRepository(databaseUrl);
const server = buildServer({
  repository,
  resolveIdentity: async () => identity,
});

beforeAll(async () => {
  await runMigrations(databaseUrl);
  const client = createDatabaseClient(databaseUrl);
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.organization_id', $1, true)", [
      identity.organizationId,
    ]);
    await client.query("insert into organizations(id,name) values ($1,$2)", [
      identity.organizationId,
      "API Test Organization",
    ]);
    await client.query("select set_config('app.household_id', $1, true)", [
      identity.householdId,
    ]);
    await client.query(
      "insert into households(id,organization_id,name) values ($1,$2,$3)",
      [identity.householdId, identity.organizationId, "API Test Household"],
    );
    await client.query("commit");
  } finally {
    await client.end();
  }
  await server.ready();
});

afterAll(async () => {
  await server.close();
  await repository.close();
});

describe("vault API persistence", () => {
  it("creates and replays an encrypted candidate fact then confirms it optimistically", async () => {
    const key = `create-${randomUUID()}`;
    const payload = {
      fieldKey: "insurance.carrier",
      ciphertextBase64: Buffer.alloc(32, 7).toString("base64"),
      keyVersion: 1,
      sourceType: "manual",
      sourceId: randomUUID(),
      evidenceIds: [],
      sensitivity: "sensitive",
    };
    const created = await server.inject({
      method: "POST",
      url: "/v1/facts",
      headers: { "idempotency-key": key },
      payload,
    });
    expect(created.statusCode).toBe(201);
    const candidate = created.json<{
      id: string;
      status: string;
      version: number;
    }>();
    expect(candidate).toMatchObject({ status: "candidate", version: 1 });
    const replay = await server.inject({
      method: "POST",
      url: "/v1/facts",
      headers: { "idempotency-key": key },
      payload,
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(candidate);

    const confirmed = await server.inject({
      method: "POST",
      url: `/v1/facts/${candidate.id}/confirm`,
      headers: {
        "idempotency-key": `confirm-${randomUUID()}`,
        "if-match": "1",
      },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({
      id: candidate.id,
      status: "confirmed",
      version: 2,
    });
  });

  it("atomically persists and replays a canonical privacy request and deletion workflow", async () => {
    const key = `privacy-${randomUUID()}`;
    const payload = { personId: randomUUID(), kind: "deletion" };
    const created = await server.inject({
      method: "POST",
      url: "/v1/privacy-requests",
      headers: { "idempotency-key": key },
      payload,
    });
    expect(created.statusCode).toBe(202);
    expect(created.json()).toMatchObject({
      privacyRequest: {
        kind: "deletion",
        status: "identity-verification",
        version: 1,
      },
      workflow: { status: "pending", version: 1 },
    });
    const replay = await server.inject({
      method: "POST",
      url: "/v1/privacy-requests",
      headers: { "idempotency-key": key },
      payload,
    });
    expect(replay.statusCode).toBe(202);
    expect(replay.json()).toEqual(created.json());
    const mismatched = await server.inject({
      method: "POST",
      url: "/v1/privacy-requests",
      headers: { "idempotency-key": key },
      payload: { personId: payload.personId, kind: "export" },
    });
    expect(mismatched.statusCode).toBe(409);
  });

  it("rejects invalid encrypted fact input before reserving its idempotency key", async () => {
    const key = `validation-${randomUUID()}`;
    const base = {
      fieldKey: "insurance.policy-number",
      keyVersion: 1,
      sourceType: "manual",
      sourceId: randomUUID(),
      evidenceIds: [],
      sensitivity: "sensitive",
    };
    const invalid = await server.inject({
      method: "POST",
      url: "/v1/facts",
      headers: { "idempotency-key": key },
      payload: { ...base, ciphertextBase64: "not base64%%%" },
    });
    expect(invalid.statusCode).toBe(400);
    const corrected = await server.inject({
      method: "POST",
      url: "/v1/facts",
      headers: { "idempotency-key": key },
      payload: {
        ...base,
        ciphertextBase64: Buffer.alloc(32, 9).toString("base64"),
      },
    });
    expect(corrected.statusCode).toBe(201);
  });
});
