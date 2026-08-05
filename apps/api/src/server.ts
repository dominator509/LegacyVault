import Fastify, { LogController } from "fastify";
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
}

export function buildServer(dependencies?: ServerDependencies) {
  const environment = loadEnvironment(process.env);
  if (
    environment.NODE_ENV === "production" &&
    (!dependencies?.auth ||
      !dependencies.authorizeIdentity ||
      !dependencies.startPortableExport)
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

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\\\", "/")}`) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `api startup failed: ${error instanceof Error ? error.name : "unknown"}\n`,
    );
    process.exitCode = 1;
  });
}
