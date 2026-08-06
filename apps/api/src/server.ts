import Fastify, { LogController } from "fastify";
import swagger from "@fastify/swagger";
import { pathToFileURL } from "node:url";
import { loadEnvironment } from "@legacy/contracts/environment";
import type { VaultRepository } from "@legacy/database/repository";
import {
  registerVaultRoutes,
  type IdentityAuthorizer,
  type IdentityResolver,
} from "./routes/vault.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { problemDetailsSchema } from "./openapi.js";
import type { StripeAdapter } from "./adapters/stripe.js";
import { registerAuthRoutes, type AuthHandler } from "./routes/auth.js";
import { createApplicationRuntime } from "./runtime.js";
import type { StartedPortableExport } from "@legacy/database/repository";
import type { StartedDocumentProcessing } from "@legacy/database/repository";
import type { ConfirmedPrivacyDeletion } from "@legacy/database/repository";
import type { CancelledPrivacyDeletion } from "@legacy/database/repository";
import type { RecordCategory, ReportKind } from "@legacy/domain";
import {
  registerHouseholdRoutes,
  type AccountResolver,
} from "./routes/households.js";
import type {
  AuthenticatedAccountIdentity,
  AuthenticatedTenantIdentity,
} from "@legacy/auth";
import type { HouseholdMembershipSummary } from "@legacy/database/repository";

export interface ServerDependencies {
  repository: VaultRepository;
  resolveIdentity: IdentityResolver;
  resolveAccount?: AccountResolver;
  authorizeIdentity?: IdentityAuthorizer;
  stripe?: StripeAdapter;
  auth?: AuthHandler;
  authBaseUrl?: string;
  createHousehold?: (
    account: AuthenticatedAccountIdentity,
    input: {
      idempotencyKey: string;
      expectedVersion: 0;
      organizationName: string;
      householdName: string;
      ownerDisplayName: string;
    },
  ) => Promise<unknown>;
  listHouseholds?: (
    account: AuthenticatedAccountIdentity,
  ) => Promise<HouseholdMembershipSummary[]>;
  listMembers?: (
    identity: AuthenticatedTenantIdentity,
  ) => Promise<readonly unknown[]>;
  createInvitation?: (
    identity: AuthenticatedTenantIdentity,
    input: {
      email: string;
      role:
        | "CoOwner"
        | "Editor"
        | "FamilyHelper"
        | "ProfessionalAdvisor"
        | "ReadOnlyViewer"
        | "EmergencyRecipient";
      expectedHouseholdVersion: number;
      idempotencyKey: string;
    },
  ) => Promise<unknown>;
  acceptInvitation?: (
    account: AuthenticatedAccountIdentity,
    input: {
      token: string;
      displayName: string;
      expectedInvitationVersion: number;
      idempotencyKey: string;
    },
  ) => Promise<unknown>;
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
  listAuditEvents?: (
    identity: AuthenticatedTenantIdentity,
    input: { afterSequence: number; limit: number },
  ) => Promise<unknown>;
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
  getSubscription?: (identity: AuthenticatedTenantIdentity) => Promise<unknown>;
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
      !dependencies.listAuditEvents ||
      !dependencies.createReport ||
      !dependencies.getReport ||
      !dependencies.createCheckout ||
      !dependencies.getSubscription ||
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

  server.register(swagger, {
    refResolver: {
      buildLocalReference(json, _baseUri, _fragment, index) {
        return typeof json.$id === "string" ? json.$id : `schema-${index}`;
      },
    },
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Legacy Vault API",
        version: "0.1.0",
        description:
          "Privacy-first household continuity API. Authenticated tenant routes require the active household header.",
      },
      components: {
        securitySchemes: {
          sessionCookie: { type: "apiKey", in: "cookie", name: "session" },
        },
      },
    },
  });
  server.addSchema(problemDetailsSchema);

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
  server.get(
    "/openapi.json",
    { schema: { hide: true } },
    async (_request, reply) =>
      reply.header("cache-control", "no-store").send(server.swagger()),
  );
  if (dependencies)
    server.register(async (instance) =>
      registerVaultRoutes(instance, dependencies),
    );
  if (
    dependencies?.resolveAccount &&
    dependencies.createHousehold &&
    dependencies.listHouseholds &&
    dependencies.listMembers &&
    dependencies.createInvitation &&
    dependencies.acceptInvitation
  )
    server.register(async (instance) =>
      registerHouseholdRoutes(instance, {
        resolveAccount: dependencies.resolveAccount!,
        resolveIdentity: dependencies.resolveIdentity,
        ...(dependencies.authorizeIdentity
          ? { authorizeIdentity: dependencies.authorizeIdentity }
          : {}),
        createHousehold: dependencies.createHousehold!,
        listHouseholds: dependencies.listHouseholds!,
        listMembers: dependencies.listMembers!,
        createInvitation: dependencies.createInvitation!,
        acceptInvitation: dependencies.acceptInvitation!,
      }),
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
