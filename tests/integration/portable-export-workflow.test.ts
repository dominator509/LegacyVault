import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  decryptEnvelope,
  encryptEnvelope,
  ExportManifestSigner,
  PostgresHouseholdKeyStore,
  type EncryptedEnvelope,
} from "../../packages/crypto/src/index.js";
import { VaultRepository } from "../../packages/database/src/repository.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { DocumentObjectStore } from "../../packages/documents/src/index.js";
import { verifyAndOpenPortableExport } from "../../packages/reports/src/index.js";
import { createPortableExportWorkflowHandler } from "../../apps/worker/src/index.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const local = readLocalEnvironment();
const databaseUrl = local.TEST_DATABASE_URL ?? "";
const organizationId = randomUUID();
const householdId = randomUUID();
const actorId = randomUUID();
const applicationKek = Buffer.from(local.APP_ENCRYPTION_KEK ?? "", "base64");
const objectStoreEndpoint = new URL(local.R2_ENDPOINT ?? "");
if (
  !new Set(["127.0.0.1", "localhost", "::1"]).has(objectStoreEndpoint.hostname)
)
  throw new Error(
    "portable export integration requires loopback object storage",
  );
const repository = new VaultRepository(databaseUrl);
const householdKeyStore = new PostgresHouseholdKeyStore(
  databaseUrl,
  applicationKek,
);
const objectStore = new DocumentObjectStore({
  endpoint: objectStoreEndpoint.toString(),
  region: "us-east-1",
  bucket: local.R2_BUCKET ?? "",
  accessKeyId: local.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: local.R2_SECRET_ACCESS_KEY ?? "",
  forcePathStyle: true,
  allowBucketCreation: true,
});
const context = { organizationId, householdId, actorId };

beforeAll(async () => {
  await runMigrations(databaseUrl);
  await objectStore.ensureBucket();
  const client = createDatabaseClient(databaseUrl);
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.organization_id',$1,true)", [
      organizationId,
    ]);
    await client.query("insert into organizations(id,name) values ($1,$2)", [
      organizationId,
      "Portable Export Organization",
    ]);
    await client.query("select set_config('app.household_id',$1,true)", [
      householdId,
    ]);
    await client.query(
      "insert into households(id,organization_id,name) values ($1,$2,$3)",
      [householdId, organizationId, "Portable Export Household"],
    );
    await client.query("commit");
  } finally {
    await client.end();
  }
});

afterAll(async () => {
  await repository.close();
  await householdKeyStore.close();
});

describe("real portable export workflow", () => {
  it("rewraps the household key, snapshots tenant data, stores an encrypted signed archive, and completes idempotently", async () => {
    const factId = randomUUID();
    const householdKey = await householdKeyStore.getOrCreateActiveKey(context);
    const factEnvelope = encryptEnvelope(
      Buffer.from('{"carrier":"Portable Mutual"}'),
      householdKey.plaintextKey,
      {
        organizationId,
        householdId,
        recordId: factId,
        purpose: "fact-value:insurance.carrier",
        keyVersion: householdKey.keyVersion,
      },
    );
    await repository.createCandidateFact(context, {
      id: factId,
      fieldKey: "insurance.carrier",
      ciphertext: Buffer.from(JSON.stringify(factEnvelope)),
      keyVersion: householdKey.keyVersion,
      sourceType: "manual",
      sourceId: randomUUID(),
      evidenceIds: [],
      sensitivity: "sensitive",
    });
    const exportKey = randomBytes(32);
    const started = await repository.startPortableExport(context, {
      idempotencyKey: `worker-export-${randomUUID()}`,
      exportKeyFingerprint: Buffer.from(exportKey).toString("hex"),
      wrappedExportKey: encryptEnvelope(exportKey, applicationKek, {
        organizationId,
        householdId,
        recordId: householdId,
        purpose: "portable-export-key",
        keyVersion: 1,
      }),
      encryptionKeyVersion: 1,
      requestedAt: "2026-08-05T22:40:00.000Z",
    });
    const handler = createPortableExportWorkflowHandler({
      repository,
      householdKeyStore,
      objectStore,
      applicationKek,
      signingKeyPkcs8Base64: local.EXPORT_SIGNING_KEY ?? "",
    });
    const job = {
      workflowId: started.workflow.id,
      organizationId,
      householdId,
      actorId,
    };
    await handler(job);
    await handler(job);

    const build = await repository.getPortableExportBuildInput(
      context,
      started.workflow.id,
    );
    expect(build.status).toBe("completed");
    const objectKey = `exports/${started.export.id}.lvault`;
    const archive = await objectStore.getCiphertext(objectKey);
    expect(Buffer.from(archive).toString("utf8")).not.toContain(
      "Portable Mutual",
    );
    const signer = new ExportManifestSigner(local.EXPORT_SIGNING_KEY ?? "");
    const opened = verifyAndOpenPortableExport({
      container: archive,
      exportKey,
      trustedPublicKeySpkiBase64: signer.publicKeySpkiBase64(),
    });
    const snapshotEntry = opened.entries.find(
      (entry) => entry.path === "records/household-snapshot.json",
    );
    const snapshot = JSON.parse(
      Buffer.from(snapshotEntry?.contentBase64 ?? "", "base64").toString(
        "utf8",
      ),
    ) as { facts: { id: string }[] };
    expect(snapshot.facts.some((fact) => fact.id === factId)).toBe(true);
    const keyEntry = opened.entries.find(
      (entry) => entry.path === "keys/household-dek.json",
    );
    const portableKey = JSON.parse(
      Buffer.from(keyEntry?.contentBase64 ?? "", "base64").toString("utf8"),
    ) as { keyVersion: number; envelope: EncryptedEnvelope };
    const recoveredHouseholdKey = decryptEnvelope(
      portableKey.envelope,
      exportKey,
      {
        organizationId: "portable-export",
        householdId: "portable-export",
        recordId: started.export.id,
        purpose: "portable-household-key",
        keyVersion: 1,
      },
    );
    expect(Buffer.from(recoveredHouseholdKey)).toEqual(
      Buffer.from(householdKey.plaintextKey),
    );
    await objectStore.deleteObject(objectKey);
    recoveredHouseholdKey.fill(0);
    householdKey.plaintextKey.fill(0);
    exportKey.fill(0);
  }, 20_000);
});
