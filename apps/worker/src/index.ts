import { Queue, QueueEvents, Worker, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";
import {
  decryptEnvelope,
  encryptEnvelope,
  ExportManifestSigner,
  type EncryptedEnvelope,
  type PostgresHouseholdKeyStore,
} from "@legacy/crypto";
import type {
  DocumentProcessingInput,
  PortableExportBuildInput,
  TenantContext,
} from "@legacy/database/repository";
import {
  DocumentQuarantineService,
  ObjectIntegrityError,
  type MalwareScanner,
  type QuarantineObjectStore,
} from "@legacy/documents";
import {
  createPortableExport,
  type PortableExportEntry,
} from "@legacy/reports";

export type WorkflowJobName =
  | "document-process"
  | "report-generate"
  | "privacy-delete"
  | "privacy-export"
  | "annual-review"
  | "notification-send";
export interface WorkflowJobData {
  workflowId: string;
  organizationId: string;
  householdId: string;
  actorId: string;
}
export type WorkflowHandler = (data: WorkflowJobData) => Promise<void>;

export interface PortableExportRepository {
  getPortableExportBuildInput(
    context: TenantContext,
    workflowId: string,
  ): Promise<PortableExportBuildInput>;
  completePortableExport(
    context: TenantContext,
    input: {
      exportId: string;
      workflowId: string;
      objectKey: string;
      archiveSha256: string;
      signerPublicKey: string;
      completedAt: string;
    },
  ): Promise<void>;
}

export interface PortableExportObjectStore {
  getCiphertext(objectKey: string): Promise<Uint8Array>;
  putGeneratedExport(input: {
    objectKey: string;
    ciphertext: Uint8Array;
    checksumSha256Base64: string;
  }): Promise<void>;
}

export interface DocumentProcessingRepository {
  getDocumentProcessingInput(
    context: TenantContext,
    workflowId: string,
  ): Promise<DocumentProcessingInput>;
  completeDocumentScan(
    context: TenantContext,
    input: {
      documentId: string;
      workflowId: string;
      documentVersion: number;
      workflowVersion: number;
      outcome: "clean" | "rejected";
      processedAt: string;
    },
  ): Promise<void>;
  recordDocumentScanFailure(
    context: TenantContext,
    input: { documentId: string; workflowId: string; errorClass: string },
  ): Promise<void>;
}

function storedEnvelope(value: unknown): EncryptedEnvelope {
  if (!value || typeof value !== "object")
    throw new Error("wrapped export key is invalid");
  const envelope = value as Partial<EncryptedEnvelope>;
  if (
    envelope.algorithm !== "A256GCM" ||
    !Number.isSafeInteger(envelope.keyVersion) ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string" ||
    typeof envelope.authenticationTag !== "string"
  )
    throw new Error("wrapped export key is invalid");
  return envelope as EncryptedEnvelope;
}

export function createPortableExportWorkflowHandler(input: {
  repository: PortableExportRepository;
  householdKeyStore: PostgresHouseholdKeyStore;
  objectStore: PortableExportObjectStore;
  applicationKek: Uint8Array;
  signingKeyPkcs8Base64: string;
}): WorkflowHandler {
  if (input.applicationKek.byteLength !== 32)
    throw new Error("application KEK must be exactly 32 bytes");
  const signer = new ExportManifestSigner(input.signingKeyPkcs8Base64);
  return async (data) => {
    const context = {
      organizationId: data.organizationId,
      householdId: data.householdId,
      actorId: data.actorId,
    };
    const build = await input.repository.getPortableExportBuildInput(
      context,
      data.workflowId,
    );
    if (build.status === "completed") return;
    const exportKey = decryptEnvelope(
      storedEnvelope(build.wrappedExportKey),
      input.applicationKek,
      {
        organizationId: context.organizationId,
        householdId: context.householdId,
        recordId: context.householdId,
        purpose: "portable-export-key",
        keyVersion: build.encryptionKeyVersion,
      },
    );
    const householdKey =
      await input.householdKeyStore.getOrCreateActiveKey(context);
    try {
      const rewrappedHouseholdKey = encryptEnvelope(
        householdKey.plaintextKey,
        exportKey,
        {
          organizationId: "portable-export",
          householdId: "portable-export",
          recordId: build.exportId,
          purpose: "portable-household-key",
          keyVersion: build.encryptionKeyVersion,
        },
      );
      const entries: PortableExportEntry[] = [
        {
          path: "records/household-snapshot.json",
          mediaType: "application/json",
          bytes: Buffer.from(JSON.stringify(build.snapshot), "utf8"),
        },
        {
          path: "keys/household-dek.json",
          mediaType: "application/json",
          bytes: Buffer.from(
            JSON.stringify({
              keyVersion: householdKey.keyVersion,
              envelope: rewrappedHouseholdKey,
            }),
            "utf8",
          ),
        },
      ];
      for (const document of build.documents)
        entries.push({
          path: `documents/${document.id}.encrypted`,
          mediaType: "application/octet-stream",
          bytes: await input.objectStore.getCiphertext(document.objectKey),
        });
      const archive = createPortableExport({
        archiveId: build.exportId,
        organizationId: context.organizationId,
        householdId: context.householdId,
        createdAt: build.createdAt,
        keyVersion: build.encryptionKeyVersion,
        exportKey,
        signingKeyPkcs8Base64: input.signingKeyPkcs8Base64,
        entries,
      });
      const archiveDigest = createHash("sha256").update(archive).digest();
      const objectKey = `exports/${build.exportId}.lvault`;
      await input.objectStore.putGeneratedExport({
        objectKey,
        ciphertext: archive,
        checksumSha256Base64: archiveDigest.toString("base64"),
      });
      await input.repository.completePortableExport(context, {
        exportId: build.exportId,
        workflowId: build.workflowId,
        objectKey,
        archiveSha256: archiveDigest.toString("hex"),
        signerPublicKey: signer.publicKeySpkiBase64(),
        completedAt: new Date().toISOString(),
      });
    } finally {
      exportKey.fill(0);
      householdKey.plaintextKey.fill(0);
    }
  };
}

export function createDocumentScanWorkflowHandler(input: {
  repository: DocumentProcessingRepository;
  householdKeyStore: PostgresHouseholdKeyStore;
  objectStore: QuarantineObjectStore;
  malwareScanner: MalwareScanner;
}): WorkflowHandler {
  return async (data) => {
    const context = {
      organizationId: data.organizationId,
      householdId: data.householdId,
      actorId: data.actorId,
    };
    let document: DocumentProcessingInput | undefined;
    try {
      document = await input.repository.getDocumentProcessingInput(
        context,
        data.workflowId,
      );
      if (
        document.status === "clean" ||
        document.status === "rejected" ||
        document.nextStep !== "scan"
      )
        return;
      if (document.status !== "quarantined")
        throw new Error("document is not quarantined");
      const householdKey =
        await input.householdKeyStore.getOrCreateActiveKey(context);
      let dataKey: Uint8Array | undefined;
      try {
        dataKey = decryptEnvelope(
          storedEnvelope(document.wrappedDataKey),
          householdKey.plaintextKey,
          {
            organizationId: context.organizationId,
            householdId: context.householdId,
            recordId: document.id,
            purpose: "document-data-key",
            keyVersion: document.encryptionKeyVersion,
          },
        );
        const quarantine = new DocumentQuarantineService(
          input.objectStore,
          input.malwareScanner,
          async (ciphertext: Uint8Array) => {
            let envelope: unknown;
            try {
              envelope = JSON.parse(Buffer.from(ciphertext).toString("utf8"));
            } catch {
              throw new ObjectIntegrityError(
                "document ciphertext envelope is invalid",
              );
            }
            const plaintext = decryptEnvelope(
              storedEnvelope(envelope),
              dataKey!,
              {
                organizationId: context.organizationId,
                householdId: context.householdId,
                recordId: document!.id,
                purpose: "document-original",
                keyVersion: document!.encryptionKeyVersion,
              },
            );
            const digest = createHash("sha256").update(plaintext).digest("hex");
            if (digest !== document!.originalSha256) {
              plaintext.fill(0);
              throw new ObjectIntegrityError(
                "document plaintext checksum mismatch",
              );
            }
            return plaintext;
          },
        );
        const result = await quarantine.scan({
          objectKey: document.objectKey,
          declaredMediaType: document.mediaType,
          maximumBytes: document.maximumBytes,
        });
        await input.repository.completeDocumentScan(context, {
          documentId: document.id,
          workflowId: document.workflowId,
          documentVersion: document.version,
          workflowVersion: document.workflowVersion,
          outcome:
            result.status === "clean-awaiting-ocr" ? "clean" : "rejected",
          processedAt: new Date().toISOString(),
        });
      } finally {
        dataKey?.fill(0);
        householdKey.plaintextKey.fill(0);
      }
    } catch (error) {
      if (document)
        await input.repository.recordDocumentScanFailure(context, {
          documentId: document.id,
          workflowId: document.workflowId,
          errorClass: error instanceof Error ? error.name : "UnknownError",
        });
      throw error;
    }
  };
}

export interface PersistedWorkflowState {
  id: string;
  status: string;
  completedSteps: string[];
  nextStep: string | null;
  version: number;
}

export interface WorkflowStateStore {
  getWorkflow(data: WorkflowJobData): Promise<PersistedWorkflowState>;
  completeStep(
    data: WorkflowJobData,
    input: { expectedVersion: number; step: string; nextStep: string | null },
  ): Promise<PersistedWorkflowState>;
  recordFailure(data: WorkflowJobData, errorClass: string): Promise<void>;
}

export interface WorkflowStep {
  name: string;
  execute(data: WorkflowJobData): Promise<void>;
}

export function createPersistedWorkflowHandler(
  store: WorkflowStateStore,
  steps: readonly WorkflowStep[],
): WorkflowHandler {
  if (
    steps.length === 0 ||
    new Set(steps.map(({ name }) => name)).size !== steps.length
  )
    throw new Error("workflow steps must be non-empty and uniquely named");
  return async (data) => {
    try {
      let workflow = await store.getWorkflow(data);
      if (workflow.status === "completed") return;
      for (const [index, step] of steps.entries()) {
        if (workflow.completedSteps.includes(step.name)) continue;
        if (workflow.nextStep !== null && workflow.nextStep !== step.name)
          throw new Error(
            "persisted workflow next step does not match its definition",
          );
        await step.execute(data);
        workflow = await store.completeStep(data, {
          expectedVersion: workflow.version,
          step: step.name,
          nextStep: steps[index + 1]?.name ?? null,
        });
      }
    } catch (error) {
      const errorClass = error instanceof Error ? error.name : "UnknownError";
      await store.recordFailure(data, errorClass);
      throw error;
    }
  };
}

function connection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 10_000,
  });
}

export function createWorkflowQueueEvents(
  redisUrl: string,
  queueName = "legacy-workflows",
) {
  return new QueueEvents(queueName, { connection: connection(redisUrl) });
}

export function createWorkflowQueue(
  redisUrl: string,
  queueName = "legacy-workflows",
) {
  return new Queue<WorkflowJobData, void, WorkflowJobName>(queueName, {
    connection: connection(redisUrl),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 500 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800, count: 5_000 },
    },
  });
}

export function enqueueWorkflow(
  queue: Queue<WorkflowJobData, void, WorkflowJobName>,
  name: WorkflowJobName,
  data: WorkflowJobData,
  options: JobsOptions = {},
) {
  return queue.add(name, data, { ...options, jobId: data.workflowId });
}

export function createWorkflowWorker(
  redisUrl: string,
  handlers: Readonly<Record<WorkflowJobName, WorkflowHandler>>,
  queueName = "legacy-workflows",
) {
  const worker = new Worker<WorkflowJobData, void, WorkflowJobName>(
    queueName,
    async (job) => handlers[job.name](job.data),
    { connection: connection(redisUrl), concurrency: 10, lockDuration: 30_000 },
  );
  worker.on("failed", (job, error) => {
    process.stderr.write(
      JSON.stringify({
        service: "worker",
        action: job?.name ?? "unknown",
        outcome: "failed",
        error_class: error.name,
        workflow_id: job?.data.workflowId ?? "unknown",
      }) + "\n",
    );
  });
  return worker;
}
