import { describe, expect, it } from "vitest";
import {
  ContentFreeMetricRegistry,
  DependencyHealthRegistry,
  ObservabilityRuntime,
  evaluateAlerts,
  traceIdFromTraceparent,
} from "../../packages/observability/src/index.js";

describe("content-free observability", () => {
  it("emits the fixed log schema and rejects payload or identifier leakage", () => {
    const runtime = new ObservabilityRuntime({
      serviceName: "legacy-api",
      environment: "test",
    });
    const record = runtime.log({
      level: "info",
      service: "legacy-api",
      environment: "test",
      requestId: "request_12345678",
      traceId: "0123456789abcdef0123456789abcdef",
      tenantPseudonym: "tenant_0123456789abcdef",
      actorPseudonym: "actor_fedcba9876543210",
      action: "get:/v1/households",
      outcome: "success",
      durationMs: 12.5,
      policyDecision: "allow",
    });
    expect(record).toMatchObject({
      service: "legacy-api",
      tenant_pseudonym: "tenant_0123456789abcdef",
      action: "get:/v1/households",
      outcome: "success",
    });
    expect(JSON.stringify(record)).not.toContain("organizationId");
    expect(() =>
      runtime.log({
        level: "info",
        service: "legacy-api",
        environment: "test",
        requestId: "request_12345678",
        traceId: "0123456789abcdef0123456789abcdef",
        action: "post:/v1/facts",
        outcome: "failure",
        durationMs: 1,
        payload: "vault content",
      } as never),
    ).toThrow("telemetry field is forbidden");
    expect(() =>
      runtime.log({
        level: "error",
        service: "legacy-api",
        environment: "test",
        requestId: "request_12345678",
        traceId: "0123456789abcdef0123456789abcdef",
        action: "contact:user@example.test",
        outcome: "failure",
        durationMs: 1,
      }),
    ).toThrow("action is not content-free");
  });

  it("bounds metric names and low-cardinality labels", () => {
    const registry = new ContentFreeMetricRegistry(2);
    registry.record("legacy_http_requests_total", 1, {
      method: "get",
      route: "/health/live",
      status_class: "2xx",
    });
    registry.record("legacy_http_request_duration_ms", 15, {
      method: "get",
      route: "/health/live",
    });
    registry.record("legacy_http_requests_total", 1, { method: "get" });
    expect(registry.snapshot()).toHaveLength(2);
    expect(registry.aggregate("legacy_http_requests_total")).toBe(1);
    expect(() =>
      registry.record("legacy_http_requests_total", 1, {
        household_id: "018f47d0-1ef2-7a4b-a6cc-111111111111",
      }),
    ).toThrow("metric label is not allowed");
  });

  it("parses only valid nonzero W3C trace IDs", () => {
    expect(
      traceIdFromTraceparent(
        "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
      ),
    ).toBe("0123456789abcdef0123456789abcdef");
    expect(
      traceIdFromTraceparent(
        "00-00000000000000000000000000000000-0123456789abcdef-01",
      ),
    ).toBeUndefined();
    expect(traceIdFromTraceparent("invalid")).toBeUndefined();
  });

  it("evaluates deterministic alerts and dependency health without payloads", () => {
    expect(
      evaluateAlerts({
        legacy_tenant_isolation_denials_total: 1,
        legacy_auth_failures_total: 25,
      }),
    ).toEqual([
      {
        id: "legacy_tenant_isolation_denials_total",
        severity: "critical",
        value: 1,
        runbook: "tenant-isolation",
      },
      {
        id: "legacy_auth_failures_total",
        severity: "warning",
        value: 25,
        runbook: "authentication-attack",
      },
    ]);
    const health = new DependencyHealthRegistry();
    health.record("postgresql", "ready");
    health.record("deepseek", "degraded", "ProviderUnavailableError");
    expect(health.snapshot()).toMatchObject({
      status: "degraded",
      dependencies: {
        postgresql: { status: "ready" },
        deepseek: {
          status: "degraded",
          errorClass: "ProviderUnavailableError",
        },
      },
    });
  });

  it("starts and closes locally without configuring an external exporter", async () => {
    const runtime = new ObservabilityRuntime({
      serviceName: "legacy-api",
      environment: "test",
    });
    await runtime.start();
    await runtime.start();
    await runtime.close();
  });
});
