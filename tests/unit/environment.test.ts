import { describe, expect, it } from "vitest";
import { loadEnvironment } from "../../packages/contracts/src/environment.js";

const productionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL:
    "postgresql://legacy:password@database.example/legacy?sslmode=require",
  SESSION_SECRET: "s".repeat(48),
  AUDIT_HMAC_KEY: "a".repeat(48),
  APP_ENCRYPTION_KEK: "k".repeat(48),
  EXPORT_SIGNING_KEY: "e".repeat(48),
  REDIS_URL: "rediss://cache.example/0",
  API_BASE_URL: "https://api.example.com",
  APP_BASE_URL: "https://app.example.com",
  EMAIL_FROM: "Legacy Vault <notices@example.com>",
  DEEPSEEK_API_KEY: "test-provider-key",
  DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  DEEPSEEK_MODEL: "configured-model",
  RESEND_API_KEY: "test-resend-key",
  STRIPE_SECRET_KEY: "test-stripe-key",
  STRIPE_WEBHOOK_SECRET: "test-webhook-key",
  STRIPE_PRICE_ESSENTIAL: "price_test",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  R2_BUCKET: "legacy-vault",
  R2_ENDPOINT: "https://objects.example.com",
  CLAMAV_HOST: "clamav.internal",
  CLAMAV_PORT: "3310",
  OCR_EXECUTABLE: "ocrmypdf",
  OCR_PYTHON_EXECUTABLE: "python3",
  DELETION_RECOVERY_DAYS: "30",
  BACKUP_RETENTION_DAYS: "35",
} as const;

describe("environment", () => {
  it("permits explicit local engineering mode outside production", () => {
    expect(
      loadEnvironment({ LOCAL_ENGINEERING_MODE: "true" })
        .LOCAL_ENGINEERING_MODE,
    ).toBe(true);
  });

  it("fails closed when local engineering mode reaches production", () => {
    expect(() =>
      loadEnvironment({
        NODE_ENV: "production",
        LOCAL_ENGINEERING_MODE: "true",
      }),
    ).toThrow();
  });

  it("requires production database and session configuration", () => {
    expect(() => loadEnvironment({ NODE_ENV: "production" })).toThrow();
  });

  it("normalizes disabled optional telemetry settings from env files", () => {
    expect(
      loadEnvironment({
        SENTRY_DSN: "",
        OTEL_EXPORTER_OTLP_ENDPOINT: "",
        OTEL_EXPORTER_OTLP_HEADERS: "",
      }),
    ).toMatchObject({
      SENTRY_DSN: undefined,
      OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
      OTEL_EXPORTER_OTLP_HEADERS: undefined,
    });
  });

  it("normalizes disabled optional OCR settings from generated env files", () => {
    expect(
      loadEnvironment({
        OCR_EXECUTABLE: "",
        OCR_PYTHON_EXECUTABLE: "",
      }),
    ).toMatchObject({
      OCR_EXECUTABLE: undefined,
      OCR_PYTHON_EXECUTABLE: undefined,
    });
  });

  it("requires encrypted production transports and the approved AI host", () => {
    expect(() => loadEnvironment(productionEnvironment)).not.toThrow();
    for (const override of [
      { API_BASE_URL: "http://api.example.com" },
      { APP_BASE_URL: "http://app.example.com" },
      { REDIS_URL: "redis://cache.example/0" },
      {
        DATABASE_URL:
          "postgresql://legacy:password@database.example/legacy?sslmode=disable",
      },
      { R2_ENDPOINT: "http://objects.example.com" },
      { DEEPSEEK_BASE_URL: "https://deepseek.attacker.example" },
      { DEEPSEEK_BASE_URL: "http://api.deepseek.com" },
    ])
      expect(() =>
        loadEnvironment({ ...productionEnvironment, ...override }),
      ).toThrow();
  });
});
