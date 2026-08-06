import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);
const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    LOCAL_ENGINEERING_MODE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    DATABASE_URL: z.string().url().optional(),
    SESSION_SECRET: z.string().min(43).optional(),
    AUDIT_HMAC_KEY: z.string().min(43).optional(),
    APP_ENCRYPTION_KEK: z.string().min(43).optional(),
    EXPORT_SIGNING_KEY: z.string().min(43).optional(),
    REDIS_URL: z.string().url().optional(),
    WORKFLOW_QUEUE_NAME: z.string().min(3).max(120).default("legacy-workflows"),
    DEEPSEEK_API_KEY: z.string().optional(),
    DEEPSEEK_BASE_URL: z.string().url().optional(),
    DEEPSEEK_MODEL: z.string().min(1).optional(),
    API_BASE_URL: z.string().url().optional(),
    APP_BASE_URL: z.string().url().optional(),
    EMAIL_FROM: z.string().min(3).optional(),
    RESEND_API_KEY: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_ESSENTIAL: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_ENDPOINT: z.string().url().optional(),
    CLAMAV_HOST: z.string().min(1).optional(),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    OCR_EXECUTABLE: z.string().min(1).optional(),
    OCR_PYTHON_EXECUTABLE: z.string().min(1).optional(),
    DELETION_RECOVERY_DAYS: z.coerce.number().int().min(1).max(365).optional(),
    BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).optional(),
    SENTRY_DSN: optionalUrl,
    OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
    OTEL_EXPORTER_OTLP_HEADERS: optionalNonEmptyString,
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && value.LOCAL_ENGINEERING_MODE) {
      context.addIssue({
        code: "custom",
        path: ["LOCAL_ENGINEERING_MODE"],
        message: "forbidden in production",
      });
    }
    if (value.NODE_ENV === "production" && !value.DATABASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "required in production",
      });
    }
    if (value.NODE_ENV === "production" && !value.SESSION_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["SESSION_SECRET"],
        message: "required in production",
      });
    }
    for (const field of [
      "API_BASE_URL",
      "APP_BASE_URL",
      "EMAIL_FROM",
      "AUDIT_HMAC_KEY",
      "APP_ENCRYPTION_KEK",
      "EXPORT_SIGNING_KEY",
      "REDIS_URL",
      "DEEPSEEK_API_KEY",
      "DEEPSEEK_BASE_URL",
      "DEEPSEEK_MODEL",
      "RESEND_API_KEY",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ESSENTIAL",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
      "R2_ENDPOINT",
      "CLAMAV_HOST",
      "CLAMAV_PORT",
      "OCR_EXECUTABLE",
      "OCR_PYTHON_EXECUTABLE",
      "DELETION_RECOVERY_DAYS",
      "BACKUP_RETENTION_DAYS",
    ] as const) {
      if (value.NODE_ENV === "production" && !value[field])
        context.addIssue({
          code: "custom",
          path: [field],
          message: "required in production",
        });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): Environment {
  return environmentSchema.parse(input);
}
