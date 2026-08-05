import { z } from "zod";

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
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): Environment {
  return environmentSchema.parse(input);
}
