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
  createReportGenerationWorkflowHandler,
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
  WORKFLOW_QUEUE_NAME: `legacy-runtime-test-${process.pid}`,
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

  it("persists a token-hashed household invitation and delivers only its bounded acceptance link through local SMTP", async () => {
    const organizationId = randomUUID();
    const householdId = randomUUID();
    const identity = {
      organizationId,
      householdId,
      actorId: randomUUID(),
      membershipId: randomUUID(),
      role: "Owner" as const,
      grants: [],
      supportApprovals: [],
      emergencyReleaseCategories: [],
      sessionIssuedAt: new Date().toISOString(),
      mfaVerifiedAt: new Date().toISOString(),
    };
    const client = createDatabaseClient(environment.DATABASE_URL ?? "");
    await client.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.organization_id',$1,true)", [
        organizationId,
      ]);
      await client.query("insert into organizations(id,name) values ($1,$2)", [
        organizationId,
        "Invitation Runtime Organization",
      ]);
      await client.query("select set_config('app.household_id',$1,true)", [
        householdId,
      ]);
      await client.query(
        "insert into households(id,organization_id,name) values ($1,$2,$3)",
        [householdId, organizationId, "Invitation Runtime Household"],
      );
      await client.query("commit");
    } finally {
      await client.end();
    }

    const email = `invite-${randomUUID()}@example.test`;
    const invitation = await runtime.dependencies.createInvitation?.(identity, {
      email,
      role: "FamilyHelper",
      expectedHouseholdVersion: 1,
      idempotencyKey: `runtime-member-invite-${randomUUID()}`,
    });
    expect(invitation).toMatchObject({
      invitation: { role: "FamilyHelper", version: 1 },
      householdVersion: 2,
    });
    expect(JSON.stringify(invitation)).not.toContain(email);

    const messages = await fetch("http://127.0.0.1:8025/api/v1/messages");
    expect(messages.ok).toBe(true);
    const body = (await messages.json()) as { messages?: MailpitSummary[] };
    const summary = body.messages?.find((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
    expect(summary?.Subject).toBe("Legacy Vault household invitation");
    const captured = await fetch(
      `http://127.0.0.1:8025/view/${summary?.ID}.txt`,
    );
    const text = await captured.text();
    expect(text).toMatch(/\/members\/invitations\/[A-Za-z0-9_-]{43}/u);
    expect(text).toContain("This link expires in 72 hours.");
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
      const pendingExport = await runtime.dependencies.getPortableExport?.(
        identity,
        started?.export.id ?? "",
      );
      expect(pendingExport).toMatchObject({
        id: started?.export.id,
        status: "pending",
        version: 1,
      });
      expect(JSON.stringify(pendingExport)).not.toContain("objectKey");
      expect(JSON.stringify(pendingExport)).not.toContain("wrapped");

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
        `runtime-report-${randomUUID()}`,
      );
      expect(report).toMatchObject({
        report: {
          kind: "family-emergency-guide",
          status: "pending",
          version: 1,
        },
        workflow: { status: "pending", version: 1 },
      });
      const reportStart = report as {
        report: { id: string };
        workflow: { id: string };
      };
      const reportKeyStore = new PostgresHouseholdKeyStore(
        environment.DATABASE_URL ?? "",
        Buffer.from(environment.APP_ENCRYPTION_KEK ?? "", "base64"),
      );
      try {
        const generate = createReportGenerationWorkflowHandler({
          repository: runtime.dependencies.repository,
          householdKeyStore: reportKeyStore,
          enqueueNotification: async () => undefined,
          now: () => new Date("2026-08-06T00:00:00.000Z"),
        });
        await generate({
          workflowId: reportStart.workflow.id,
          organizationId,
          householdId,
          actorId,
        });
      } finally {
        await reportKeyStore.close();
      }
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [organizationId, householdId],
      );
      const reportRow = await client.query<{
        status: string;
        payload_encrypted: Buffer;
        encryption_key_version: number;
      }>(
        "select status,payload_encrypted,encryption_key_version from reports where id=$1",
        [reportStart.report.id],
      );
      await client.query("commit");
      expect(reportRow.rows[0]?.status).toBe("completed");
      const reportEnvelope = JSON.parse(
        reportRow.rows[0]?.payload_encrypted.toString("utf8") ?? "{}",
      ) as EncryptedEnvelope;
      const reportOpenKeyStore = new PostgresHouseholdKeyStore(
        environment.DATABASE_URL ?? "",
        Buffer.from(environment.APP_ENCRYPTION_KEK ?? "", "base64"),
      );
      const reportHouseholdKey =
        await reportOpenKeyStore.getOrCreateActiveKey(identity);
      let reportPayload: Uint8Array | undefined;
      try {
        reportPayload = decryptEnvelope(
          reportEnvelope,
          reportHouseholdKey.plaintextKey,
          {
            organizationId,
            householdId,
            recordId: reportStart.report.id,
            purpose: "report-payload:family-emergency-guide",
            keyVersion: reportRow.rows[0]?.encryption_key_version ?? 0,
          },
        );
      } finally {
        reportHouseholdKey.plaintextKey.fill(0);
        await reportOpenKeyStore.close();
      }
      const openedReport = JSON.parse(
        Buffer.from(reportPayload ?? []).toString("utf8"),
      ) as { claims: { factId: string; evidenceIds: string[] }[] };
      reportPayload?.fill(0);
      expect(openedReport.claims).toEqual([
        expect.objectContaining({
          factId: encrypted?.id,
          evidenceIds: [evidenceId],
        }),
      ]);
      const listedFacts = await runtime.dependencies.listVaultFacts?.(
        identity,
        ["insurance"],
      );
      expect(listedFacts).toEqual([
        expect.objectContaining({
          id: encrypted?.id,
          fieldKey: "insurance.carrier",
          value: { carrier: "Runtime Mutual" },
          status: "confirmed",
        }),
      ]);
      expect(JSON.stringify(listedFacts)).not.toContain("ciphertext");
      const retrievedReport = await runtime.dependencies.getReport?.(
        identity,
        reportStart.report.id,
      );
      expect(retrievedReport).toEqual(openedReport);

      const documentPlaintext = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALklEQVR4nO3OMQEAAAjDsIF/z0MGT2qgmbb5bF/vAAAAAAAAAAAAAAAAAAAASQ5AtAM9yMAItAAAAABJRU5ErkJggg==",
        "base64",
      );
      const documentIdempotencyKey = `runtime-document-${randomUUID()}`;
      const documentExpiresAt = "2026-08-20T00:00:00.000Z";
      const documentUpload = await runtime.dependencies.startDocumentUpload?.(
        identity,
        {
          idempotencyKey: documentIdempotencyKey,
          originalSha256: createHash("sha256")
            .update(documentPlaintext)
            .digest("hex"),
          mediaType: "image/png",
          maximumBytes: 1024 * 1024,
          expiresAt: documentExpiresAt,
          documentConsentPolicyVersion: "document-processing-v1",
          deleteOriginalAfterProcessing: true,
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
          mediaType: "image/png",
          maximumBytes: 1024 * 1024,
          expiresAt: documentExpiresAt,
          documentConsentPolicyVersion: "document-processing-v1",
          deleteOriginalAfterProcessing: true,
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
        expires_at: Date;
      }>(
        "select d.status,d.ciphertext_sha256,d.wrapped_data_key,d.expires_at,w.subject_type,w.subject_id from documents d join workflow_runs w on w.subject_id=d.id where d.id=$1",
        [documentUpload?.document.id],
      );
      await client.query("commit");
      expect(documentRow.rows[0]).toMatchObject({
        status: "quarantined",
        ciphertext_sha256: ciphertextDigest.toString("hex"),
        subject_type: "Document",
        subject_id: documentUpload?.document.id,
      });
      expect(documentRow.rows[0]?.expires_at.toISOString()).toBe(
        documentExpiresAt,
      );
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
          original_deleted_at: Date;
          delete_original_after_processing: boolean;
          consent_policy_version: string;
        }>(
          "select dd.id,dd.object_key,dd.ciphertext_sha256,w.next_step,w.status as workflow_status,d.original_deleted_at,d.delete_original_after_processing,dc.policy_version as consent_policy_version from document_derivatives dd join workflow_runs w on w.subject_id=dd.document_id join documents d on d.id=dd.document_id join document_consents dc on dc.document_id=d.id where dd.document_id=$1",
          [documentUpload?.document.id],
        );
        await client.query("commit");
        expect(derivative.rows[0]).toMatchObject({
          id: documentUpload?.document.id,
          next_step: "classification",
          workflow_status: "running",
          delete_original_after_processing: true,
          consent_policy_version: "document-processing-v1",
        });
        expect(derivative.rows[0]?.original_deleted_at).toBeInstanceOf(Date);
        await expect(
          scanObjectStore.getCiphertext(persistedDocument.objectKey),
        ).rejects.toBeDefined();
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
          expectedWorkflowVersion: 4,
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
        const listedDocuments =
          await runtime.dependencies.listVaultDocuments?.(identity);
        expect(listedDocuments).toEqual([
          expect.objectContaining({
            id: documentUpload?.document.id,
            mediaType: "image/png",
            status: "clean",
            expiresAt: documentExpiresAt,
            deleteOriginalAfterProcessing: true,
            originalDeletedAt: expect.any(String),
          }),
        ]);
        expect(JSON.stringify(listedDocuments)).not.toContain("objectKey");
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
      } finally {
        await scanKeyStore.close();
      }
      documentPlaintext.fill(0);
      documentKey.fill(0);
      documentCiphertext.fill(0);
    } finally {
      await client.end();
    }
  }, 20_000);
});
