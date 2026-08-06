import Fastify, { LogController } from "fastify";
import { pathToFileURL } from "node:url";
import { loadEnvironment } from "@legacy/contracts/environment";
import type { VaultRepository } from "@legacy/database/repository";
import {
  registerVaultRoutes,
  type IdentityAuthorizer,
  type IdentityResolver,
} from "./routes/vault.js";
import { registerBillingRoutes } from "./routes/billing.js";
import type { StripeAdapter } from "./adapters/stripe.js";
import { registerAuthRoutes, type AuthHandler } from "./routes/auth.js";
import { createApplicationRuntime } from "./runtime.js";
import type { AuthenticatedTenantIdentity } from "@legacy/auth";
import type { StartedPortableExport } from "@legacy/database/repository";
import type { StartedDocumentProcessing } from "@legacy/database/repository";
import type { ConfirmedPrivacyDeletion } from "@legacy/database/repository";
import type { CancelledPrivacyDeletion } from "@legacy/database/repository";
import type { RecordCategory, ReportKind } from "@legacy/domain";

export interface ServerDependencies {
  repository: VaultRepository;
  resolveIdentity: IdentityResolver;
  authorizeIdentity?: IdentityAuthorizer;
  stripe?: StripeAdapter;
  auth?: AuthHandler;
  authBaseUrl?: string;
  startPortableExport?: (
    identity: AuthenticatedTenantIdentity,
    input: { idempotencyKey: string; exportKey: Uint8Array },
  ) => Promise<StartedPortableExport>;
  getPortableExport?: (
    identity: AuthenticatedTenantIdentity,
    exportId: string,
  ) => Promise<unknown | null>;
  confirmPrivacyDeletion?: (
    identity: AuthenticatedTenantIdentity,
    input: {
      requestId: string;
      expectedVersion: number;
      idempotencyKey: string;
    },
  ) => Promise<ConfirmedPrivacyDeletion>;
  cancelPrivacyDeletion?: (
    identity: AuthenticatedTenantIdentity,
    input: {
      requestId: string;
      expectedVersion: number;
      idempotencyKey: string;
    },
  ) => Promise<CancelledPrivacyDeletion>;
  encryptFactValue?: (
    identity: AuthenticatedTenantIdentity,
    input: { fieldKey: string; plaintext: Uint8Array },
  ) => Promise<{ id: string; ciphertext: Uint8Array; keyVersion: number }>;
  encryptEmergencyReason?: (
    identity: AuthenticatedTenantIdentity,
    plaintext: Uint8Array,
  ) => Promise<{ id: string; ciphertext: Uint8Array; keyVersion: number }>;
  listVaultFacts?: (
    identity: AuthenticatedTenantIdentity,
    categories: readonly RecordCategory[],
  ) => Promise<readonly unknown[]>;
  listVaultDocuments?: (
    identity: AuthenticatedTenantIdentity,
  ) => Promise<readonly unknown[]>;
  createReport?: (
    identity: AuthenticatedTenantIdentity,
    kind: ReportKind,
    idempotencyKey: string,
  ) => Promise<unknown>;
  getReport?: (
    identity: AuthenticatedTenantIdentity,
    reportId: string,
  ) => Promise<unknown | null>;
  createCheckout?: (
    identity: AuthenticatedTenantIdentity,
    idempotencyKey: string,
  ) => Promise<{ id: string; url: string }>;
  startDocumentUpload?: (
    identity: AuthenticatedTenantIdentity,
    input: {
      idempotencyKey: string;
      originalSha256: string;
      mediaType: string;
      maximumBytes: number;
      expiresAt?: string;
      documentConsentPolicyVersion: string;
      deleteOriginalAfterProcessing: boolean;
    },
  ) => Promise<{
    document: { id: string; status: string; version: number };
    encryption: {
      algorithm: "A256GCM";
      keyBase64: string;
      keyVersion: number;
      purpose: string;
    };
  }>;
  createDocumentUploadUrl?: (
    identity: AuthenticatedTenantIdentity,
    input: {
      documentId: string;
      expectedVersion: number;
      ciphertextSha256: string;
    },
  ) => Promise<{ uploadUrl: string; expiresInSeconds: number }>;
  completeDocumentUpload?: (
    identity: AuthenticatedTenantIdentity,
    input: {
      documentId: string;
      expectedVersion: number;
      ciphertextSha256: string;
      idempotencyKey: string;
    },
  ) => Promise<StartedDocumentProcessing>;
  completeManualDocumentExtraction?: (
    identity: AuthenticatedTenantIdentity,
    input: {
      documentId: string;
      workflowId: string;
      expectedWorkflowVersion: number;
      idempotencyKey: string;
      candidates: readonly {
        fieldKey: string;
        value: unknown;
        locator: string;
        sensitivity: string;
        confidence?: number;
      }[];
    },
  ) => Promise<unknown>;
  runAiInterview?: (
    identity: AuthenticatedTenantIdentity,
    input: {
      message: string;
      categories: readonly RecordCategory[];
      expectedConsentVersion: number;
      idempotencyKey: string;
    },
  ) => Promise<unknown>;
}

export function buildServer(dependencies?: ServerDependencies) {
  const environment = loadEnvironment(process.env);
  if (
    environment.NODE_ENV === "production" &&
    (!dependencies?.auth ||
      !dependencies.authorizeIdentity ||
      !dependencies.startPortableExport ||
      !dependencies.getPortableExport ||
      !dependencies.confirmPrivacyDeletion ||
      !dependencies.cancelPrivacyDeletion ||
      !dependencies.encryptFactValue ||
      !dependencies.encryptEmergencyReason ||
      !dependencies.listVaultFacts ||
      !dependencies.listVaultDocuments ||
      !dependencies.createReport ||
      !dependencies.getReport ||
      !dependencies.createCheckout ||
      !dependencies.startDocumentUpload ||
      !dependencies.createDocumentUploadUrl ||
      !dependencies.completeDocumentUpload ||
      !dependencies.completeManualDocumentExtraction ||
      !dependencies.runAiInterview)
  )
    throw new Error(
      "production authentication and authorization dependencies are required",
    );
  const server = Fastify({
    logController: new LogController({ disableRequestLogging: true }),
    logger: {
      level: environment.LOG_LEVEL,
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.set-cookie",
      ],
    },
    requestIdHeader: "x-request-id",
  });

  server.get("/health/live", async () => ({ status: "live" as const }));
  server.get("/health/ready", async (_request, reply) => {
    if (!environment.LOCAL_ENGINEERING_MODE && !environment.DATABASE_URL) {
      return reply
        .code(503)
        .send({ status: "not-ready", reason: "database-unconfigured" });
    }
    return { status: "ready" as const };
  });
  server.get("/health/dependencies", async () => ({
    status: environment.LOCAL_ENGINEERING_MODE ? "degraded" : "configured",
    externalVerificationDeferred: environment.LOCAL_ENGINEERING_MODE,
    serviceRoutesConfigured: Boolean(dependencies),
  }));
  if (dependencies)
    server.register(async (instance) =>
      registerVaultRoutes(instance, dependencies),
    );
  if (dependencies?.stripe)
    server.register(async (instance) =>
      registerBillingRoutes(instance, {
        repository: dependencies.repository,
        stripe: dependencies.stripe!,
      }),
    );
  if (dependencies?.auth && dependencies.authBaseUrl)
    server.register(async (instance) =>
      registerAuthRoutes(
        instance,
        dependencies.auth!,
        dependencies.authBaseUrl!,
      ),
    );
  return server;
}

async function main() {
  const environment = loadEnvironment(process.env);
  const runtime = createApplicationRuntime(environment);
  const server = buildServer(runtime.dependencies);
  const shutdown = async () => {
    await server.close();
    await runtime.close();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  try {
    await server.listen({ host: environment.HOST, port: environment.PORT });
  } catch (error) {
    await runtime.close();
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `api startup failed: ${error instanceof Error ? error.name : "unknown"}\n`,
    );
    process.exitCode = 1;
  });
}
