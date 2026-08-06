import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createReportGenerationWorkflowHandler } from "../../apps/worker/src/index.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { VaultRepository } from "../../packages/database/src/repository.js";
import {
  decryptEnvelope,
  encryptEnvelope,
  PostgresHouseholdKeyStore,
  type EncryptedEnvelope,
} from "../../packages/crypto/src/index.js";
import type { Report } from "../../packages/domain/src/index.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const local = readLocalEnvironment();
const databaseUrl = local.TEST_DATABASE_URL ?? "";
const repository = new VaultRepository(databaseUrl);
const keyStore = new PostgresHouseholdKeyStore(
  databaseUrl,
  Buffer.from(local.APP_ENCRYPTION_KEK ?? "", "base64"),
);

beforeAll(async () => runMigrations(databaseUrl));
afterAll(async () => Promise.all([repository.close(), keyStore.close()]));

describe("queued encrypted annual review", () => {
  it("detects stale facts, expiring documents, contradictions, and missing categories", async () => {
    const context = {
      organizationId: randomUUID(),
      householdId: randomUUID(),
      actorId: randomUUID(),
    };
    const client = createDatabaseClient(databaseUrl);
    await client.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.organization_id',$1,true)", [
        context.organizationId,
      ]);
      await client.query("insert into organizations(id,name) values ($1,$2)", [
        context.organizationId,
        "Annual Review Organization",
      ]);
      await client.query("select set_config('app.household_id',$1,true)", [
        context.householdId,
      ]);
      await client.query(
        "insert into households(id,organization_id,name) values ($1,$2,$3)",
        [
          context.householdId,
          context.organizationId,
          "Annual Review Household",
        ],
      );
      await client.query("commit");
    } finally {
      await client.end();
    }

    const householdKey = await keyStore.getOrCreateActiveKey(context);
    const factIds = [randomUUID(), randomUUID(), randomUUID()];
    const values = ["Example Mutual", "Different Mutual", "123 Example St"];
    try {
      for (const [index, factId] of factIds.entries()) {
        const fieldKey = index === 2 ? "property.address" : "insurance.carrier";
        const payload = Buffer.from(JSON.stringify(values[index]), "utf8");
        const ciphertext = Buffer.from(
          JSON.stringify(
            encryptEnvelope(payload, householdKey.plaintextKey, {
              organizationId: context.organizationId,
              householdId: context.householdId,
              recordId: factId,
              purpose: `fact-value:${fieldKey}`,
              keyVersion: householdKey.keyVersion,
            }),
          ),
          "utf8",
        );
        await repository.createCandidateFact(context, {
          id: factId,
          fieldKey,
          ciphertext,
          keyVersion: householdKey.keyVersion,
          sourceType: "manual",
          sourceId: context.actorId,
          evidenceIds: [randomUUID()],
          sensitivity: "sensitive",
        });
        if (index < 2)
          await repository.confirmFact(
            context,
            factId,
            1,
            "2024-01-01T00:00:00.000Z",
          );
        payload.fill(0);
        ciphertext.fill(0);
      }
    } finally {
      householdKey.plaintextKey.fill(0);
    }

    const documentId = randomUUID();
    const writeClient = createDatabaseClient(databaseUrl);
    await writeClient.connect();
    try {
      await writeClient.query("begin");
      await writeClient.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [context.organizationId, context.householdId],
      );
      await writeClient.query(
        "insert into documents(id,organization_id,household_id,object_key,original_sha256,media_type,status,encryption_key_version,wrapped_data_key,maximum_bytes,ciphertext_sha256,uploaded_at,expires_at) values ($1,$2,$3,$4,$5,'application/pdf','clean',1,'{}',1024,$5,'2026-01-01T00:00:00Z','2026-08-20T00:00:00Z')",
        [
          documentId,
          context.organizationId,
          context.householdId,
          `annual-review/${randomUUID()}`,
          "a".repeat(64),
        ],
      );
      await writeClient.query("commit");
    } finally {
      await writeClient.end();
    }

    const started = await repository.startReport(context, {
      idempotencyKey: `annual-review-${randomUUID()}`,
      kind: "annual-review",
      requestedAt: "2026-08-06T00:00:00.000Z",
    });
    const handler = createReportGenerationWorkflowHandler({
      repository,
      householdKeyStore: keyStore,
      now: () => new Date("2026-08-06T00:00:00.000Z"),
    });
    await handler({
      workflowId: started.workflow.id,
      ...context,
    });
    await handler({
      workflowId: started.workflow.id,
      ...context,
    });

    const readClient = createDatabaseClient(databaseUrl);
    await readClient.connect();
    let encryptedPayload: Buffer;
    let keyVersion: number;
    try {
      await readClient.query("begin");
      await readClient.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [context.organizationId, context.householdId],
      );
      const result = await readClient.query<{
        status: string;
        claims: unknown[];
        payload_encrypted: Buffer;
        encryption_key_version: number;
      }>(
        "select status,claims,payload_encrypted,encryption_key_version from reports where id=$1",
        [started.report.id],
      );
      await readClient.query("commit");
      expect(result.rows[0]?.status).toBe("completed");
      expect(result.rows[0]?.claims).toEqual([]);
      encryptedPayload = result.rows[0]?.payload_encrypted ?? Buffer.alloc(0);
      keyVersion = result.rows[0]?.encryption_key_version ?? 0;
      expect(encryptedPayload.toString("utf8")).not.toContain("Example Mutual");
    } finally {
      await readClient.end();
    }

    expect(
      await repository.getReport(context, started.report.id),
    ).toMatchObject({
      id: started.report.id,
      kind: "annual-review",
      status: "completed",
    });
    await expect(
      repository.getReport(
        {
          organizationId: randomUUID(),
          householdId: randomUUID(),
          actorId: randomUUID(),
        },
        started.report.id,
      ),
    ).resolves.toBeNull();

    const openKey = await keyStore.getOrCreateActiveKey(context);
    let opened: Uint8Array | undefined;
    try {
      opened = decryptEnvelope(
        JSON.parse(encryptedPayload.toString("utf8")) as EncryptedEnvelope,
        openKey.plaintextKey,
        {
          organizationId: context.organizationId,
          householdId: context.householdId,
          recordId: started.report.id,
          purpose: "report-payload:annual-review",
          keyVersion,
        },
      );
    } finally {
      openKey.plaintextKey.fill(0);
    }
    const report = JSON.parse(Buffer.from(opened).toString("utf8")) as Report;
    opened.fill(0);
    expect(report.missingCategories).toContain("property");
    expect(report.notices).toEqual([
      "unconfirmed-information-present",
      "missing-information-present",
    ]);
    expect(report.reviewFindings).toEqual({
      staleFactIds: factIds.slice(0, 2).sort(),
      expiringDocumentIds: [documentId],
      contradictions: [
        {
          fieldKey: "insurance.carrier",
          factIds: factIds.slice(0, 2).sort(),
        },
      ],
    });
    expect(report.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factId: factIds[2], status: "missing" }),
      ]),
    );
  });
});
