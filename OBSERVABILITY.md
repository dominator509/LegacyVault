# Observability

## Privacy law

Telemetry is content-free. The allowlisted runtime schema includes timestamp, level, service, environment, request ID, trace ID, pseudonymous tenant/actor identifiers, canonical action, outcome, duration, policy decision, and error class. Payloads, documents, extracted facts, prompts, outputs, credentials, cookies, tokens, emails, names, addresses, full identifiers, signed URLs, ciphertext, and plaintext are forbidden.

`@legacy/observability` rejects unknown fields, high-risk keys and values, unbounded metric names, high-cardinality labels, invalid pseudonyms, invalid trace IDs, and insecure production exporter URLs. Sentry is configured with default PII disabled and removes request, user, and breadcrumb objects before delivery.

## Exporters

- With no `OTEL_EXPORTER_OTLP_ENDPOINT`, the bounded in-process registry remains available and no external telemetry is sent.
- With an approved endpoint, official pinned OpenTelemetry exporters send traces to `/v1/traces` and metrics to `/v1/metrics` with a 30-second interval and 10-second export timeout.
- `OTEL_EXPORTER_OTLP_HEADERS` is parsed as comma-separated `name=value` pairs and is never logged.
- `SENTRY_DSN` enables content-free exception-class reporting only. External ingest remains optional and requires its live probe.
- Production exporter URLs must use HTTPS.

## Metrics

The fixed metric registry covers HTTP latency/count, queue depth/failures, database pool pressure, object failures, authentication failures, AI latency/input/output/cache tokens/cost/DLP/retries/schema success, deletion backlog, privacy request age, export/report failures, emergency requests, tenant-isolation denials, audit-chain failures, and backup failures.

AI labels are limited to provider, task family, prompt version, model, mode, outcome, and error class. They never contain tenant, request text, evidence, provider response content, or idempotency keys. Cache hit ratio must be calculated from eligible cache hit and miss tokens; a percentage without eligible-token and effective-cost context is not a ship claim.

## Dashboard

The launch dashboard has these bounded panels:

1. Availability: readiness state, HTTP request rate, error rate, and p50/p95/p99 latency by canonical route.
2. Workflows: queue depth/failure rate, report duration, export failures, document-processing backlog, and worker saturation.
3. Privacy/security: tenant-isolation denials, audit-chain failures, authentication failures, DLP blocks, privacy request age, deletion backlog, and emergency request volume.
4. AI safety/cost: provider outcome, input/output/cache tokens, eligible cache ratio, latency, retry count, schema success, DLP findings, and estimated cost.
5. Recovery: last verified backup age, backup failures, last restore duration, and restore-verification outcome.

Every dashboard variable is low-cardinality. There is no free-text search over application logs for customer content because such content must never be present.

## Alerts

Critical alerts page immediately for tenant-isolation denials, audit-chain failures, and backup failures. Warning alerts cover repeated export failures, deletion backlog, privacy request age, and authentication attack volume. Thresholds are deterministic in `evaluateAlerts`; provider-side routing must reference the matching runbook in `OPERATIONS.md`.

## Trace propagation

Valid W3C `traceparent` headers retain only the 32-hex trace ID. Invalid or all-zero trace IDs are rejected and a request-ID-derived trace ID is used. Spans and Sentry tags accept only the same low-cardinality allowlist as metrics.

## Verification

Unit tests prove schema rejection, bounded metrics, trace parsing, alert thresholds, and dependency health. Integration and smoke tests prove real Fastify request logs/metrics remain content-free. External OTLP/Sentry probes remain deferred until approved ingest endpoints are supplied.
