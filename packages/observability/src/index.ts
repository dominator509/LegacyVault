import { metrics, trace, type Attributes } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import * as Sentry from "@sentry/node";

export const metricNames = [
  "legacy_http_request_duration_ms",
  "legacy_http_requests_total",
  "legacy_queue_depth",
  "legacy_queue_failures_total",
  "legacy_db_pool_waiting",
  "legacy_object_failures_total",
  "legacy_auth_failures_total",
  "legacy_ai_request_duration_ms",
  "legacy_ai_input_tokens_total",
  "legacy_ai_output_tokens_total",
  "legacy_ai_cache_hit_tokens_total",
  "legacy_ai_cache_miss_tokens_total",
  "legacy_ai_cost_usd_total",
  "legacy_ai_dlp_findings_total",
  "legacy_ai_retries_total",
  "legacy_ai_schema_success_total",
  "legacy_deletion_backlog",
  "legacy_privacy_request_oldest_age_seconds",
  "legacy_export_failures_total",
  "legacy_report_duration_ms",
  "legacy_emergency_requests_total",
  "legacy_tenant_isolation_denials_total",
  "legacy_audit_chain_failures_total",
  "legacy_backup_failures_total",
] as const;

export type MetricName = (typeof metricNames)[number];
export type TelemetryLevel = "debug" | "info" | "warn" | "error";
export type TelemetryOutcome = "success" | "denied" | "failure" | "degraded";

const metricNameSet = new Set<string>(metricNames);
const labelKeys = new Set([
  "service",
  "environment",
  "method",
  "route",
  "status_class",
  "operation",
  "queue",
  "provider",
  "task_family",
  "prompt_version",
  "model",
  "mode",
  "outcome",
  "error_class",
  "policy_decision",
]);
const forbiddenKeys =
  /(?:payload|body|document|content|prompt|output|cookie|authorization|credential|password|secret|token|signed[_-]?url|ciphertext|plaintext|email|name|address|phone|ssn|card)/iu;
const forbiddenValue =
  /(?:bearer\s+\S+|sk-[a-z0-9]{12,}|-----BEGIN|\b\d{3}-\d{2}-\d{4}\b|\b(?:\d[ -]*?){13,19}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/iu;
const canonicalValue = /^[a-z0-9][a-z0-9._:/-]{0,159}$/u;
const contentFreeLabelValue = /^[a-z0-9/][a-z0-9._:/-]{0,159}$/u;
const errorClassValue = /^[A-Za-z][A-Za-z0-9.]{0,119}$/u;

export interface ContentFreeLogInput {
  level: TelemetryLevel;
  service: string;
  environment: string;
  requestId: string;
  traceId: string;
  action: string;
  outcome: TelemetryOutcome;
  durationMs: number;
  tenantPseudonym?: string;
  actorPseudonym?: string;
  policyDecision?: string;
  errorClass?: string;
}

export interface ContentFreeLogRecord {
  timestamp: string;
  level: TelemetryLevel;
  service: string;
  environment: string;
  request_id: string;
  trace_id: string;
  action: string;
  outcome: TelemetryOutcome;
  duration_ms: number;
  tenant_pseudonym?: string;
  actor_pseudonym?: string;
  policy_decision?: string;
  error_class?: string;
}

export interface MetricPoint {
  name: MetricName;
  value: number;
  labels: Readonly<Record<string, string>>;
  observedAt: string;
}

export interface ObservabilityConfiguration {
  serviceName: string;
  environment: "development" | "test" | "production";
  otlpEndpoint?: string;
  otlpHeaders?: string;
  sentryDsn?: string;
}

export interface AlertSignal {
  id: string;
  severity: "warning" | "critical";
  value: number;
  runbook: string;
}

export class ContentFreeMetricRegistry {
  readonly #points: MetricPoint[] = [];
  readonly #limit: number;
  readonly #onRecord: ((point: MetricPoint) => void) | undefined;

  constructor(limit = 10_000, onRecord?: (point: MetricPoint) => void) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100_000)
      throw new Error("metric registry limit is invalid");
    this.#limit = limit;
    this.#onRecord = onRecord;
  }

  record(
    name: MetricName,
    value: number,
    labels: Readonly<Record<string, string>> = {},
  ): void {
    if (!metricNameSet.has(name)) throw new Error("metric name is not allowed");
    if (!Number.isFinite(value) || value < 0)
      throw new Error("metric value is invalid");
    const normalized: Record<string, string> = {};
    for (const [key, label] of Object.entries(labels).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!labelKeys.has(key)) throw new Error("metric label is not allowed");
      assertContentFreeValue(label, `metric label ${key}`);
      normalized[key] = label;
    }
    const point = {
      name,
      value,
      labels: normalized,
      observedAt: new Date().toISOString(),
    } satisfies MetricPoint;
    this.#points.push(point);
    if (this.#points.length > this.#limit) this.#points.shift();
    this.#onRecord?.(point);
  }

  snapshot(): readonly MetricPoint[] {
    return this.#points.map((point) => ({
      ...point,
      labels: { ...point.labels },
    }));
  }

  aggregate(name: MetricName): number {
    return this.#points
      .filter((point) => point.name === name)
      .reduce((total, point) => total + point.value, 0);
  }
}

export class DependencyHealthRegistry {
  readonly #dependencies = new Map<
    string,
    {
      status: "ready" | "degraded" | "failed";
      checkedAt: string;
      errorClass?: string;
    }
  >();

  record(
    dependency: string,
    status: "ready" | "degraded" | "failed",
    errorClass?: string,
  ): void {
    assertCanonical(dependency, "dependency");
    if (errorClass) assertErrorClass(errorClass);
    this.#dependencies.set(dependency, {
      status,
      checkedAt: new Date().toISOString(),
      ...(errorClass ? { errorClass } : {}),
    });
  }

  snapshot(): {
    status: "ready" | "degraded" | "failed";
    dependencies: Readonly<
      Record<
        string,
        {
          status: "ready" | "degraded" | "failed";
          checkedAt: string;
          errorClass?: string;
        }
      >
    >;
  } {
    const dependencies = Object.fromEntries(
      [...this.#dependencies.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );
    const states = Object.values(dependencies).map(({ status }) => status);
    return {
      status: states.includes("failed")
        ? "failed"
        : states.includes("degraded")
          ? "degraded"
          : "ready",
      dependencies,
    };
  }
}

export class ObservabilityRuntime {
  readonly metrics: ContentFreeMetricRegistry;
  readonly health = new DependencyHealthRegistry();
  readonly #configuration: ObservabilityConfiguration;
  readonly #instruments = new Map<
    MetricName,
    ReturnType<ReturnType<typeof metrics.getMeter>["createHistogram"]>
  >();
  #sdk?: NodeSDK;
  #started = false;

  constructor(configuration: ObservabilityConfiguration) {
    assertCanonical(configuration.serviceName, "service name");
    validateExternalConfiguration(configuration);
    this.#configuration = configuration;
    this.metrics = new ContentFreeMetricRegistry(10_000, (point) =>
      this.#recordOpenTelemetry(point),
    );
  }

  async start(): Promise<void> {
    if (this.#started) return;
    const headers = parseOtlpHeaders(this.#configuration.otlpHeaders);
    if (this.#configuration.otlpEndpoint) {
      const endpoint = this.#configuration.otlpEndpoint.replace(/\/$/u, "");
      this.#sdk = new NodeSDK({
        serviceName: this.#configuration.serviceName,
        traceExporter: new OTLPTraceExporter({
          url: `${endpoint}/v1/traces`,
          headers,
        }),
        metricReader: new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: `${endpoint}/v1/metrics`,
            headers,
          }),
          exportIntervalMillis: 30_000,
          exportTimeoutMillis: 10_000,
        }),
      });
      await this.#sdk.start();
    }
    if (this.#configuration.sentryDsn) {
      Sentry.init({
        dsn: this.#configuration.sentryDsn,
        environment: this.#configuration.environment,
        sendDefaultPii: false,
        maxBreadcrumbs: 0,
        beforeSend(event) {
          delete event.request;
          delete event.user;
          delete event.breadcrumbs;
          return event;
        },
      });
    }
    this.#started = true;
  }

  log(input: ContentFreeLogInput): ContentFreeLogRecord {
    assertExactKeys(input, [
      "level",
      "service",
      "environment",
      "requestId",
      "traceId",
      "action",
      "outcome",
      "durationMs",
      "tenantPseudonym",
      "actorPseudonym",
      "policyDecision",
      "errorClass",
    ]);
    assertCanonical(input.service, "service");
    assertCanonical(input.environment, "environment");
    assertIdentifier(input.requestId, "request ID");
    if (!/^[a-f0-9]{32}$/u.test(input.traceId))
      throw new Error("trace ID is invalid");
    assertCanonical(input.action, "action");
    if (!Number.isFinite(input.durationMs) || input.durationMs < 0)
      throw new Error("duration is invalid");
    if (input.tenantPseudonym) assertPseudonym(input.tenantPseudonym, "tenant");
    if (input.actorPseudonym) assertPseudonym(input.actorPseudonym, "actor");
    if (input.policyDecision)
      assertCanonical(input.policyDecision, "policy decision");
    if (input.errorClass) assertErrorClass(input.errorClass);
    return {
      timestamp: new Date().toISOString(),
      level: input.level,
      service: input.service,
      environment: input.environment,
      request_id: input.requestId,
      trace_id: input.traceId,
      action: input.action,
      outcome: input.outcome,
      duration_ms: input.durationMs,
      ...(input.tenantPseudonym
        ? { tenant_pseudonym: input.tenantPseudonym }
        : {}),
      ...(input.actorPseudonym
        ? { actor_pseudonym: input.actorPseudonym }
        : {}),
      ...(input.policyDecision
        ? { policy_decision: input.policyDecision }
        : {}),
      ...(input.errorClass ? { error_class: input.errorClass } : {}),
    };
  }

  async withSpan<T>(
    name: string,
    attributes: Attributes,
    operation: () => Promise<T>,
  ): Promise<T> {
    assertCanonical(name, "span name");
    for (const [key, value] of Object.entries(attributes)) {
      if (!labelKeys.has(key)) throw new Error("span attribute is not allowed");
      if (typeof value === "string") assertContentFreeValue(value, key);
    }
    return trace
      .getTracer(this.#configuration.serviceName)
      .startActiveSpan(name, { attributes }, async (span) => {
        try {
          return await operation();
        } catch (error) {
          span.recordException(error instanceof Error ? error : "UnknownError");
          throw error;
        } finally {
          span.end();
        }
      });
  }

  captureException(
    error: unknown,
    tags: Readonly<Record<string, string>>,
  ): void {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(tags)) {
      if (!labelKeys.has(key)) throw new Error("error tag is not allowed");
      assertContentFreeValue(value, `error tag ${key}`);
      normalized[key] = value;
    }
    if (this.#configuration.sentryDsn)
      Sentry.captureException(
        error instanceof Error
          ? new Error(error.name)
          : new Error("UnknownError"),
        { tags: normalized },
      );
  }

  async close(): Promise<void> {
    if (!this.#started) return;
    if (this.#configuration.sentryDsn) await Sentry.flush(2_000);
    await this.#sdk?.shutdown();
    this.#started = false;
  }

  #recordOpenTelemetry(point: MetricPoint): void {
    if (!this.#started || !this.#sdk) return;
    const meter = metrics.getMeter(this.#configuration.serviceName);
    let instrument = this.#instruments.get(point.name);
    if (!instrument) {
      instrument = meter.createHistogram(point.name);
      this.#instruments.set(point.name, instrument);
    }
    instrument.record(point.value, point.labels);
  }
}

export function evaluateAlerts(
  values: Readonly<Partial<Record<MetricName, number>>>,
): readonly AlertSignal[] {
  const alerts: AlertSignal[] = [];
  const rules: readonly [
    MetricName,
    number,
    AlertSignal["severity"],
    string,
  ][] = [
    [
      "legacy_tenant_isolation_denials_total",
      1,
      "critical",
      "tenant-isolation",
    ],
    ["legacy_audit_chain_failures_total", 1, "critical", "audit-chain"],
    ["legacy_backup_failures_total", 1, "critical", "backup-restore"],
    ["legacy_export_failures_total", 3, "warning", "export-failures"],
    ["legacy_deletion_backlog", 10, "warning", "privacy-deletion"],
    [
      "legacy_privacy_request_oldest_age_seconds",
      72 * 60 * 60,
      "warning",
      "privacy-request-sla",
    ],
    ["legacy_auth_failures_total", 25, "warning", "authentication-attack"],
  ];
  for (const [name, threshold, severity, runbook] of rules) {
    const value = values[name] ?? 0;
    if (!Number.isFinite(value) || value < 0)
      throw new Error("alert input is invalid");
    if (value >= threshold) alerts.push({ id: name, severity, value, runbook });
  }
  return alerts;
}

export function traceIdFromTraceparent(
  traceparent: string | undefined,
): string | undefined {
  if (!traceparent) return undefined;
  const match = /^00-([a-f0-9]{32})-[a-f0-9]{16}-[0-9a-f]{2}$/u.exec(
    traceparent.trim(),
  );
  if (!match || /^0{32}$/u.test(match[1] ?? "")) return undefined;
  return match[1];
}

function validateExternalConfiguration(
  configuration: ObservabilityConfiguration,
): void {
  for (const [name, value] of [
    ["OTLP endpoint", configuration.otlpEndpoint],
    ["Sentry DSN", configuration.sentryDsn],
  ] as const) {
    if (!value) continue;
    const url = new URL(value);
    if (configuration.environment === "production" && url.protocol !== "https:")
      throw new Error(`${name} must use HTTPS in production`);
  }
}

function parseOtlpHeaders(value?: string): Record<string, string> {
  if (!value) return {};
  const headers: Record<string, string> = {};
  for (const part of value.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) throw new Error("OTLP header configuration is invalid");
    const key = part.slice(0, separator).trim().toLowerCase();
    const headerValue = part.slice(separator + 1).trim();
    if (!/^[a-z0-9-]{1,64}$/u.test(key) || !headerValue)
      throw new Error("OTLP header configuration is invalid");
    if (forbiddenKeys.test(key) && key !== "authorization")
      throw new Error("OTLP header name is forbidden");
    headers[key] = headerValue;
  }
  return headers;
}

function assertExactKeys(value: object, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value))
    if (!allowedSet.has(key) || forbiddenKeys.test(key))
      throw new Error("telemetry field is forbidden");
}

function assertCanonical(value: string, field: string): void {
  if (!canonicalValue.test(value) || forbiddenValue.test(value))
    throw new Error(`${field} is not content-free`);
}

function assertErrorClass(value: string): void {
  if (!errorClassValue.test(value) || forbiddenValue.test(value))
    throw new Error("error class is invalid");
}

function assertIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(value))
    throw new Error(`${field} is invalid`);
}

function assertPseudonym(value: string, kind: "tenant" | "actor"): void {
  if (!new RegExp(`^${kind}_[a-f0-9]{16}$`, "u").test(value))
    throw new Error(`${kind} pseudonym is invalid`);
}

function assertContentFreeValue(value: string, field: string): void {
  if (!contentFreeLabelValue.test(value) || forbiddenValue.test(value))
    throw new Error(`${field} is not content-free`);
}
