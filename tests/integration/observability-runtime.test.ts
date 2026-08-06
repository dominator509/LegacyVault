import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApplicationRuntime } from "../../apps/api/src/runtime.js";
import { buildServer } from "../../apps/api/src/server.js";
import { loadEnvironment } from "../../packages/contracts/src/environment.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const local = readLocalEnvironment();
const environment = loadEnvironment({
  ...local,
  NODE_ENV: "test",
  LOCAL_ENGINEERING_MODE: "true",
  DATABASE_URL: local.TEST_DATABASE_URL,
  API_BASE_URL: "http://127.0.0.1:3001",
  APP_BASE_URL: "http://127.0.0.1:3000",
  WORKFLOW_QUEUE_NAME: `legacy-observability-test-${process.pid}`,
});
const runtime = createApplicationRuntime(environment);
const server = buildServer(runtime.dependencies);

beforeAll(async () => {
  await runMigrations(environment.DATABASE_URL ?? "");
  await runtime.observability.start();
  await server.ready();
});

afterAll(async () => {
  await server.close();
  await runtime.close();
});

describe("real Fastify observability", () => {
  it("records bounded content-free request metrics through the real hooks", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/health/live",
      headers: {
        "x-request-id": "observability_request_12345678",
        traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
      },
    });
    expect(response.statusCode).toBe(200);
    const points = runtime.observability.metrics.snapshot();
    expect(points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "legacy_http_requests_total",
          value: 1,
          labels: expect.objectContaining({
            method: "get",
            route: "/health/live",
            status_class: "2xx",
          }),
        }),
        expect.objectContaining({
          name: "legacy_http_request_duration_ms",
        }),
      ]),
    );
    const serialized = JSON.stringify(points);
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("cookie");
    expect(serialized).not.toContain("observability_request_12345678");
  });
});
