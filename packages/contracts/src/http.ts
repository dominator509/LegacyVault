import { z } from "zod";

export const routeGroups = [
  "auth",
  "households",
  "members",
  "facts",
  "documents",
  "extractions",
  "reports",
  "exports",
  "privacy-requests",
  "emergency-access",
  "consents",
  "billing",
  "audit-events",
  "health",
  "ai-settings",
] as const;

export const mutationHeadersSchema = z.object({
  "idempotency-key": z.string().min(16).max(200),
  "if-match": z.coerce.number().int().nonnegative(),
});

export const problemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  traceId: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
