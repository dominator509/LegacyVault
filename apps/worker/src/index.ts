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
  PortableExportBuildInput,
  TenantContext,
} from "@legacy/database/repository";
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
