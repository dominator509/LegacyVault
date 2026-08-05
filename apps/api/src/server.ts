import Fastify from "fastify";
import { loadEnvironment } from "@legacy/contracts/environment";

export function buildServer() {
  const environment = loadEnvironment(process.env);
  const server = Fastify({
    logger: {
      level: environment.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
    },
    requestIdHeader: "x-request-id",
  });

  server.get("/health/live", async () => ({ status: "live" as const }));
  server.get("/health/ready", async (_request, reply) => {
    if (!environment.LOCAL_ENGINEERING_MODE && !environment.DATABASE_URL) {
      return reply.code(503).send({ status: "not-ready", reason: "database-unconfigured" });
    }
    return { status: "ready" as const };
  });
  server.get("/health/dependencies", async () => ({
    status: environment.LOCAL_ENGINEERING_MODE ? "degraded" : "configured",
    externalVerificationDeferred: environment.LOCAL_ENGINEERING_MODE,
  }));
  return server;
}

async function main() {
  const environment = loadEnvironment(process.env);
  const server = buildServer();
  await server.listen({ host: environment.HOST, port: environment.PORT });
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\\\", "/")}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`api startup failed: ${error instanceof Error ? error.name : "unknown"}\n`);
    process.exitCode = 1;
  });
}
