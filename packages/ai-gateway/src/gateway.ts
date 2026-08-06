import { createHash } from "node:crypto";
import type { z } from "zod";
import {
  buildPrompt,
  stableStringify,
  type PromptEnvelope,
} from "./canonical.js";
import { scanDlp, type DlpFinding } from "./dlp.js";
import {
  ProviderUnavailableError,
  type AiProvider,
  type ProviderResult,
  type ProviderUsage,
} from "./provider.js";

export class AiPolicyError extends Error {
  override readonly name = "AiPolicyError";
  constructor(
    message: string,
    readonly findings: readonly DlpFinding[] = [],
  ) {
    super(message);
  }
}
export interface GatewayMetric {
  outcome:
    | "success"
    | "policy-blocked"
    | "provider-error"
    | "schema-error"
    | "application-cache-hit"
    | "application-cache-miss";
  taskFamily: string;
  promptVersion: string;
  model: string;
  mode: "standard" | "thinking";
  usage: ProviderUsage;
  latencyMs: number;
  dlpFindingsCount: number;
  schemaSuccess: boolean;
  retryCount: number;
  estimatedCostUsd: number;
  errorClass?: string;
}
export interface GatewayRequest<T> {
  organizationId: string;
  householdId: string;
  purpose: string;
  consentGranted: boolean;
  envelope: PromptEnvelope;
  schema: z.ZodType<T>;
  mode: "standard" | "thinking";
  model: string;
  maxOutputTokens: number;
  estimatedInputCostPerMillion: number;
  estimatedOutputCostPerMillion: number;
}

export class AiPolicyGateway {
  constructor(
    private readonly provider: AiProvider,
    private readonly emitMetric: (metric: GatewayMetric) => void,
  ) {}
  cacheKey(
    request: Pick<
      GatewayRequest<unknown>,
      | "organizationId"
      | "householdId"
      | "purpose"
      | "envelope"
      | "mode"
      | "model"
      | "maxOutputTokens"
    > & { consentVersion: number },
  ): string {
    return createHash("sha256")
      .update(
        stableStringify({
          organizationId: request.organizationId,
          householdId: request.householdId,
          purpose: request.purpose,
          consentVersion: request.consentVersion,
          envelope: request.envelope,
          mode: request.mode,
          model: request.model,
          maxOutputTokens: request.maxOutputTokens,
        }),
      )
      .digest("hex");
  }
  recordApplicationCache(
    request: Pick<GatewayRequest<unknown>, "envelope" | "model" | "mode">,
    hit: boolean,
    latencyMs: number,
  ): void {
    this.emitMetric({
      outcome: hit ? "application-cache-hit" : "application-cache-miss",
      taskFamily: request.envelope.promptFamily,
      promptVersion: request.envelope.promptVersion,
      model: request.model,
      mode: request.mode,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheHitTokens: 0,
        cacheMissTokens: 0,
      },
      latencyMs,
      dlpFindingsCount: 0,
      schemaSuccess: hit,
      retryCount: 0,
      estimatedCostUsd: 0,
    });
  }
  async execute<T>(request: GatewayRequest<T>): Promise<T> {
    if (request.purpose !== request.envelope.promptFamily)
      throw new AiPolicyError("AI purpose does not match prompt family");
    if (!request.consentGranted)
      throw new AiPolicyError("affirmative external AI consent is required");
    const findings = scanDlp(request.envelope.content);
    if (findings.length) {
      this.emitMetric({
        ...emptyMetric(request),
        outcome: "policy-blocked",
        dlpFindingsCount: findings.length,
        errorClass: "DlpPolicyViolation",
      });
      throw new AiPolicyError(
        "prohibited content blocked before provider boundary",
        findings,
      );
    }
    const prompt = buildPrompt(request.envelope);
    const started = performance.now();
    let result: ProviderResult;
    try {
      result = await this.provider.invoke({
        ...prompt,
        model: request.model,
        mode: request.mode,
        maxOutputTokens: request.maxOutputTokens,
      });
    } catch (error) {
      this.emitMetric({
        ...emptyMetric(request),
        outcome: "provider-error",
        latencyMs: performance.now() - started,
        retryCount:
          error instanceof ProviderUnavailableError ? error.retryCount : 0,
        errorClass: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
    let schemaSuccess = false;
    try {
      const parsed = request.schema.parse(JSON.parse(result.content));
      schemaSuccess = true;
      return parsed;
    } finally {
      const cost =
        (result.usage.inputTokens * request.estimatedInputCostPerMillion +
          result.usage.outputTokens * request.estimatedOutputCostPerMillion) /
        1_000_000;
      this.emitMetric({
        outcome: schemaSuccess ? "success" : "schema-error",
        taskFamily: request.envelope.promptFamily,
        promptVersion: request.envelope.promptVersion,
        model: result.model,
        mode: request.mode,
        usage: result.usage,
        latencyMs: performance.now() - started,
        dlpFindingsCount: 0,
        schemaSuccess,
        retryCount: result.retryCount,
        estimatedCostUsd: cost,
        ...(!schemaSuccess ? { errorClass: "SchemaValidationError" } : {}),
      });
    }
  }
}

function emptyMetric<T>(request: GatewayRequest<T>): GatewayMetric {
  return {
    outcome: "provider-error",
    taskFamily: request.envelope.promptFamily,
    promptVersion: request.envelope.promptVersion,
    model: request.model,
    mode: request.mode,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheHitTokens: 0,
      cacheMissTokens: 0,
    },
    latencyMs: 0,
    dlpFindingsCount: 0,
    schemaSuccess: false,
    retryCount: 0,
    estimatedCostUsd: 0,
  };
}
