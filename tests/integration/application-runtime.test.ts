import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnvironment } from "../../packages/contracts/src/environment.js";
import { createApplicationRuntime } from "../../apps/api/src/runtime.js";
import { buildServer } from "../../apps/api/src/server.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { AuthorizationDeniedError } from "../../packages/auth/src/index.js";
import {
  ClamAvScanner,
  DockerOcrMyPdfAdapter,
  DocumentObjectStore,
} from "../../packages/documents/src/index.js";
import {
  createDocumentOcrWorkflowHandler,
  createDocumentScanWorkflowHandler,
} from "../../apps/worker/src/index.js";
import {
  decryptEnvelope,
  encryptEnvelope,
  PostgresHouseholdKeyStore,
  type EncryptedEnvelope,
} from "../../packages/crypto/src/index.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

function imageOnlyPdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length 35 >>\nstream\nq\n200 0 0 200 0 0 cm\n/Im0 Do\nQ\nendstream",
    "<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 9 >>\nstream\n00FFFFFF>\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

const local = readLocalEnvironment();
const objectStoreEndpoint = local.R2_ENDPOINT;
if (!objectStoreEndpoint)
  throw new Error("integration object storage endpoint is required");
const objectStoreHost = new URL(objectStoreEndpoint).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(objectStoreHost))
  throw new Error("integration object storage endpoint must be loopback");
const environment = loadEnvironment({
  NODE_ENV: "test",
  LOCAL_ENGINEERING_MODE: "true",
  DATABASE_URL: local.TEST_DATABASE_URL,
  SESSION_SECRET: local.SESSION_SECRET,
  AUDIT_HMAC_KEY: local.AUDIT_HMAC_KEY,
  APP_ENCRYPTION_KEK: local.APP_ENCRYPTION_KEK,
  EXPORT_SIGNING_KEY: local.EXPORT_SIGNING_KEY,
  REDIS_URL: local.REDIS_URL,
  API_BASE_URL: "http://127.0.0.1:3001",
  APP_BASE_URL: "http://127.0.0.1:3000",
  EMAIL_FROM: "Legacy Vault <notices@localhost.invalid>",
  R2_ACCESS_KEY_ID: local.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: local.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: local.R2_BUCKET,
  R2_ENDPOINT: local.R2_ENDPOINT,
});
const runtime = createApplicationRuntime(environment);
const server = buildServer(runtime.dependencies);

beforeAll(async () => {
  await runMigrations(environment.DATABASE_URL ?? "");
  await server.ready();
});

afterAll(async () => {
  await server.close();
  await runtime.close();
});

describe("composed application runtime", () => {
  it("persists a real signup and delivers its verification message through local SMTP", async () => {
    const suffix = randomUUID();
    const email = `runtime-${suffix}@example.test`;
    const signup = await server.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin: environment.APP_BASE_URL ?? "" },
      payload: {
        name: "Runtime Integration User",
        email,
        password: "runtime password has sufficient length 2026",
      },
    });
    expect(signup.statusCode).toBe(200);
    expect(signup.json()).toMatchObject({
      token: null,
      user: { email, emailVerified: false },
    });

    const messages = await fetch("http://127.0.0.1:8025/api/v1/messages");
    expect(messages.ok).toBe(true);
    const body = (await messages.json()) as { messages?: MailpitSummary[] };
    const summary = body.messages?.find((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
    expect(summary?.Subject).toBe("Verify email for Legacy Vault");
    const captured = await fetch(
      `http://127.0.0.1:8025/view/${summary?.ID}.txt`,
    );
    const text = await captured.text();
    expect(text).toContain("/api/auth/verify-email");
    expect(text).toContain("This link expires in 30 minutes.");
  }, 20_000);

  it("fails closed through the production authorizer and appends content-free allow and deny decisions", async () => {
    const organizationId = randomUUID();
    const householdId = randomUUID();
    const actorId = randomUUID();
    const client = createDatabaseClient(environment.DATABASE_URL ?? "");
    await client.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.organization_id',$1,true)", [
        organizationId,
      ]);
      await client.query("insert into organizations(id,name) values ($1,$2)", [
        organizationId,
        "Runtime Authorization Organization",
      ]);
      await client.query("select set_config('app.household_id',$1,true)", [
        householdId,
      ]);
      await client.query(
        "insert into households(id,organization_id,name) values ($1,$2,$3)",
        [householdId, organizationId, "Runtime Authorization Household"],
      );
      await client.query("commit");

      const now = new Date().toISOString();
      const identity = {
        organizationId,
        householdId,
        actorId,
        membershipId: randomUUID(),
        role: "Owner" as const,
        grants: [],
        supportApprovals: [],
        emergencyReleaseCategories: [],
        sessionIssuedAt: now,
        mfaVerifiedAt: now,
      };
      await runtime.dependencies.authorizeIdentity?.(identity, {
        category: "insurance",
        action: "create",
        purpose: "vault.fact.create",
      });
      const { mfaVerifiedAt: _mfaVerifiedAt, ...identityWithoutMfa } = identity;
      await expect(
        runtime.dependencies.authorizeIdentity?.(identityWithoutMfa, {
          category: "insurance",
          action: "create",
          purpose: "vault.fact.create",
        }),
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);

      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [organizationId, householdId],
      );
      const events = await client.query<{
        action: string;
        outcome: string;
        metadata: Record<string, unknown>;
      }>("select action,outcome,metadata from audit_events order by sequence");
      await client.query("commit");
      expect(events.rows).toEqual([
        {
          action: "vault.fact.create",
          outcome: "allowed",
          metadata: {
            category: "insurance",
            permission_action: "create",
          },
        },
        {
          action: "vault.fact.create",
          outcome: "denied",
          metadata: {
            category: "insurance",
            permission_action: "create",
            decision_reason: "mfa-required",
          },
        },
      ]);

      const exportKey = Buffer.alloc(32, 19);
      const idempotencyKey = `runtime-export-${randomUUID()}`;
      const started = await runtime.dependencies.startPortableExport?.(
        identity,
        { idempotencyKey, exportKey },
      );
      const replay = await runtime.dependencies.startPortableExport?.(
        identity,
        { idempotencyKey, exportKey: Buffer.from(exportKey) },
      );
      expect(replay).toEqual(started);
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [organizationId, householdId],
      );
      const persisted = await client.query<{
        status: string;
        wrapped_export_key: unknown;
        subject_type: string;
        subject_id: string;
      }>(
        "select e.status,e.wrapped_export_key,w.subject_type,w.subject_id from exports e join workflow_runs w on w.id=e.workflow_id where e.id=$1",
        [started?.export.id],
      );
      await client.query("commit");
      expect(persisted.rows[0]).toMatchObject({
        status: "pending",
        subject_type: "Export",
        subject_id: started?.export.id,
      });
      expect(
        JSON.stringify(persisted.rows[0]?.wrapped_export_key),
      ).not.toContain(exportKey.toString("base64"));

      const plaintext = Buffer.from('{"carrier":"Runtime Mutual"}');
      const encrypted = await runtime.dependencies.encryptFactValue?.(
        identity,
        { fieldKey: "insurance.carrier", plaintext },
      );
      expect(encrypted).toBeDefined();
      const evidenceId = randomUUID();
      await runtime.dependencies.repository.createCandidateFact(identity, {
        id: encrypted?.id ?? "",
        fieldKey: "insurance.carrier",
        ciphertext: encrypted?.ciphertext ?? new Uint8Array(),
        keyVersion: encrypted?.keyVersion ?? 0,
        sourceType: "manual",
        sourceId: randomUUID(),
        evidenceIds: [evidenceId],
        sensitivity: "sensitive",
      });
      expect(
        Buffer.from(encrypted?.ciphertext ?? []).toString("utf8"),
      ).not.toContain("Runtime Mutual");
      const keyStore = new PostgresHouseholdKeyStore(
        environment.DATABASE_URL ?? "",
        Buffer.from(environment.APP_ENCRYPTION_KEK ?? "", "base64"),
      );
      try {
        const householdKey = await keyStore.getOrCreateActiveKey(identity);
        const envelope = JSON.parse(
          Buffer.from(encrypted?.ciphertext ?? []).toString("utf8"),
        ) as EncryptedEnvelope;
        const opened = decryptEnvelope(envelope, householdKey.plaintextKey, {
          organizationId,
          householdId,
          recordId: encrypted?.id ?? "",
          purpose: "fact-value:insurance.carrier",
          keyVersion: encrypted?.keyVersion ?? 0,
        });
        expect(Buffer.from(opened).toString("utf8")).toBe(
          '{"carrier":"Runtime Mutual"}',
        );
        householdKey.plaintextKey.fill(0);
      } finally {
        await keyStore.close();
      }
      plaintext.fill(0);
      await runtime.dependencies.repository.confirmFact(
        identity,
        encrypted?.id ?? "",
        1,
        new Date().toISOString(),
      );
      const report = await runtime.dependencies.createReport?.(
        identity,
        "family-emergency-guide",
      );
      expect(report).toMatchObject({
        kind: "family-emergency-guide",
        version: 1,
      });
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [organizationId, householdId],
      );
      const reportRow = await client.query<{
        claims: { factId: string; evidenceIds: string[] }[];
      }>("select claims from reports where id=$1", [report?.id]);
      await client.query("commit");
      expect(reportRow.rows[0]?.claims).toEqual([
        expect.objectContaining({
          factId: encrypted?.id,
          evidenceIds: [evidenceId],
        }),
      ]);

      const documentPlaintext = imageOnlyPdf();
      const documentIdempotencyKey = `runtime-document-${randomUUID()}`;
      const documentUpload = await runtime.dependencies.startDocumentUpload?.(
        identity,
        {
          idempotencyKey: documentIdempotencyKey,
          originalSha256: createHash("sha256")
            .update(documentPlaintext)
            .digest("hex"),
          mediaType: "application/pdf",
          maximumBytes: 1024 * 1024,
        },
      );
      expect(documentUpload?.encryption.algorithm).toBe("A256GCM");
      const replayedDocument = await runtime.dependencies.startDocumentUpload?.(
        identity,
        {
          idempotencyKey: documentIdempotencyKey,
          originalSha256: createHash("sha256")
            .update(documentPlaintext)
            .digest("hex"),
          mediaType: "application/pdf",
          maximumBytes: 1024 * 1024,
        },
      );
      expect(replayedDocument).toEqual(documentUpload);
      const documentKey = Buffer.from(
        documentUpload?.encryption.keyBase64 ?? "",
        "base64",
      );
      const documentCiphertext = Buffer.from(
        JSON.stringify(
          encryptEnvelope(documentPlaintext, documentKey, {
            organizationId,
            householdId,
            recordId: documentUpload?.document.id ?? "",
            purpose: "document-original",
            keyVersion: documentUpload?.encryption.keyVersion ?? 0,
          }),
        ),
      );
      const ciphertextDigest = createHash("sha256")
        .update(documentCiphertext)
        .digest();
      const signedUpload = await runtime.dependencies.createDocumentUploadUrl?.(
        identity,
        {
          documentId: documentUpload?.document.id ?? "",
          expectedVersion: documentUpload?.document.version ?? 0,
          ciphertextSha256: ciphertextDigest.toString("hex"),
        },
      );
      const uploadResponse = await fetch(signedUpload?.uploadUrl ?? "", {
        method: "PUT",
        headers: {
          "content-type": "application/vnd.legacy-vault.encrypted+json",
          "x-amz-checksum-sha256": ciphertextDigest.toString("base64"),
        },
        body: documentCiphertext,
      });
      expect(uploadResponse.ok).toBe(true);
      const documentProcessing =
        await runtime.dependencies.completeDocumentUpload?.(identity, {
          documentId: documentUpload?.document.id ?? "",
          expectedVersion: documentUpload?.document.version ?? 0,
          ciphertextSha256: ciphertextDigest.toString("hex"),
          idempotencyKey: `runtime-document-complete-${randomUUID()}`,
        });
      expect(documentProcessing).toMatchObject({
        document: { status: "quarantined", version: 2 },
        workflow: { status: "pending", version: 1 },
      });
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [organizationId, householdId],
      );
      const documentRow = await client.query<{
        status: string;
        ciphertext_sha256: string;
        wrapped_data_key: unknown;
        subject_type: string;
        subject_id: string;
      }>(
        "select d.status,d.ciphertext_sha256,d.wrapped_data_key,w.subject_type,w.subject_id from documents d join workflow_runs w on w.subject_id=d.id where d.id=$1",
        [documentUpload?.document.id],
      );
      await client.query("commit");
      expect(documentRow.rows[0]).toMatchObject({
        status: "quarantined",
        ciphertext_sha256: ciphertextDigest.toString("hex"),
        subject_type: "Document",
        subject_id: documentUpload?.document.id,
      });
      expect(
        JSON.stringify(documentRow.rows[0]?.wrapped_data_key),
      ).not.toContain(documentUpload?.encryption.keyBase64);
      const scanKeyStore = new PostgresHouseholdKeyStore(
        environment.DATABASE_URL ?? "",
        Buffer.from(environment.APP_ENCRYPTION_KEK ?? "", "base64"),
      );
      const scanObjectStore = new DocumentObjectStore({
        endpoint: objectStoreEndpoint,
        region: "auto",
        bucket: local.R2_BUCKET ?? "",
        accessKeyId: local.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: local.R2_SECRET_ACCESS_KEY ?? "",
        forcePathStyle: true,
        allowBucketCreation: true,
      });
      try {
        const scan = createDocumentScanWorkflowHandler({
          repository: runtime.dependencies.repository,
          householdKeyStore: scanKeyStore,
          objectStore: scanObjectStore,
          malwareScanner: new ClamAvScanner({
            host: "127.0.0.1",
            port: 13310,
            timeoutMs: 10_000,
          }),
        });
        await scan({
          workflowId: documentProcessing?.workflow.id ?? "",
          organizationId,
          householdId,
          actorId,
        });
        await client.query("begin");
        await client.query(
          "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
          [organizationId, householdId],
        );
        const scanRow = await client.query<{
          status: string;
          next_step: string;
          workflow_status: string;
          last_error_class: string | null;
        }>(
          "select d.status,w.next_step,w.status as workflow_status,w.last_error_class from documents d join workflow_runs w on w.subject_id=d.id where d.id=$1",
          [documentUpload?.document.id],
        );
        await client.query("commit");
        expect(scanRow.rows[0]).toEqual({
          status: "clean",
          next_step: "ocr",
          workflow_status: "running",
          last_error_class: null,
        });
        const persistedDocument =
          await runtime.dependencies.repository.getDocumentProcessingInput(
            identity,
            documentProcessing?.workflow.id ?? "",
          );
        expect(
          await scanObjectStore.objectStatus(persistedDocument.objectKey),
        ).toBe("clean");
        const ocr = createDocumentOcrWorkflowHandler({
          repository: runtime.dependencies.repository,
          householdKeyStore: scanKeyStore,
          objectStore: scanObjectStore,
          ocr: new DockerOcrMyPdfAdapter({
            dockerExecutable: "docker",
            image:
              "jbarlow83/ocrmypdf:v17.8.1@sha256:0563a68359fe4e68022974103794a69d5d37270686f99c9030a7667ebbb639d4",
            timeoutMs: 120_000,
          }),
        });
        await ocr({
          workflowId: documentProcessing?.workflow.id ?? "",
          organizationId,
          householdId,
          actorId,
        });
        await client.query("begin");
        await client.query(
          "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
          [organizationId, householdId],
        );
        const derivative = await client.query<{
          id: string;
          object_key: string;
          ciphertext_sha256: string;
          next_step: string;
          workflow_status: string;
        }>(
          "select dd.id,dd.object_key,dd.ciphertext_sha256,w.next_step,w.status as workflow_status from document_derivatives dd join workflow_runs w on w.subject_id=dd.document_id where dd.document_id=$1",
          [documentUpload?.document.id],
        );
        await client.query("commit");
        expect(derivative.rows[0]).toMatchObject({
          id: documentUpload?.document.id,
          next_step: "classification",
          workflow_status: "running",
        });
        const encryptedSearchablePdf = await scanObjectStore.getCiphertext(
          derivative.rows[0]?.object_key ?? "",
        );
        expect(
          createHash("sha256").update(encryptedSearchablePdf).digest("hex"),
        ).toBe(derivative.rows[0]?.ciphertext_sha256);
        const searchableEnvelope = JSON.parse(
          Buffer.from(encryptedSearchablePdf).toString("utf8"),
        ) as EncryptedEnvelope;
        const searchablePdf = decryptEnvelope(searchableEnvelope, documentKey, {
          organizationId,
          householdId,
          recordId: documentUpload?.document.id ?? "",
          purpose: "document-searchable-pdf",
          keyVersion: documentUpload?.encryption.keyVersion ?? 0,
        });
        expect(
          Buffer.from(searchablePdf.subarray(0, 5)).toString("ascii"),
        ).toBe("%PDF-");
        searchablePdf.fill(0);
        const extractionKey = `runtime-manual-extraction-${randomUUID()}`;
        const extractionInput = {
          documentId: documentUpload?.document.id ?? "",
          workflowId: documentProcessing?.workflow.id ?? "",
          expectedWorkflowVersion: 3,
          idempotencyKey: extractionKey,
          candidates: [
            {
              fieldKey: "insurance.policy-number",
              value: "LV-1002",
              locator: "page:1",
              sensitivity: "sensitive",
              confidence: 1,
            },
          ],
        } as const;
        const extraction =
          await runtime.dependencies.completeManualDocumentExtraction?.(
            identity,
            extractionInput,
          );
        const extractionReplay =
          await runtime.dependencies.completeManualDocumentExtraction?.(
            identity,
            extractionInput,
          );
        expect(extractionReplay).toEqual(extraction);
        expect(extraction).toMatchObject({
          documentId: documentUpload?.document.id,
          workflowId: documentProcessing?.workflow.id,
          status: "completed",
          candidates: [{ status: "candidate", version: 1 }],
        });
        await client.query("begin");
        await client.query(
          "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
          [organizationId, householdId],
        );
        const extracted = await client.query<{
          id: string;
          typed_value_encrypted: Buffer;
          key_version: number;
          status: string;
          locator: string;
          workflow_status: string;
          next_step: string | null;
        }>(
          "select f.id,f.typed_value_encrypted,f.key_version,f.status,e.locator,w.status as workflow_status,w.next_step from facts f join evidence e on e.id=(f.evidence_ids->>0)::uuid join workflow_runs w on w.subject_id=f.source_id where f.source_id=$1 and f.field_key='insurance.policy-number'",
          [documentUpload?.document.id],
        );
        await client.query("commit");
        expect(extracted.rows[0]).toMatchObject({
          status: "candidate",
          locator: "page:1",
          workflow_status: "completed",
          next_step: null,
        });
        const extractedEnvelope = JSON.parse(
          extracted.rows[0]?.typed_value_encrypted.toString("utf8") ?? "",
        ) as EncryptedEnvelope;
        const extractionHouseholdKey =
          await scanKeyStore.getOrCreateActiveKey(identity);
        try {
          const extractedValue = decryptEnvelope(
            extractedEnvelope,
            extractionHouseholdKey.plaintextKey,
            {
              organizationId,
              householdId,
              recordId: extracted.rows[0]?.id ?? "",
              purpose: "fact-value:insurance.policy-number",
              keyVersion: extracted.rows[0]?.key_version ?? 0,
            },
          );
          expect(Buffer.from(extractedValue).toString("utf8")).toBe(
            '"LV-1002"',
          );
          extractedValue.fill(0);
        } finally {
          extractionHouseholdKey.plaintextKey.fill(0);
        }
        await scanObjectStore.deleteObject(
          derivative.rows[0]?.object_key ?? "",
        );
        await scanObjectStore.deleteObject(persistedDocument.objectKey);
      } finally {
        await scanKeyStore.close();
      }
      documentPlaintext.fill(0);
      documentKey.fill(0);
      documentCiphertext.fill(0);
    } finally {
      await client.end();
    }
  });
});
