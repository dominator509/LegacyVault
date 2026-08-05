import { createHash } from "node:crypto";
import type { z } from "zod";
import {
  buildPrompt,
  stableStringify,
  type PromptEnvelope,
} from "./canonical.js";
import { scanDlp, type DlpFinding } from "./dlp.js";
import type { AiProvider, ProviderUsage } from "./provider.js";

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
      "organizationId" | "householdId" | "envelope"
    >,
  ): string {
    return createHash("sha256")
      .update(
        stableStringify({
          organizationId: request.organizationId,
          householdId: request.householdId,
          promptFamily: request.envelope.promptFamily,
          promptVersion: request.envelope.promptVersion,
          safeHouseholdCapsule: request.envelope.safeHouseholdCapsule,
          content: request.envelope.content,
        }),
      )
      .digest("hex");
  }
  async execute<T>(request: GatewayRequest<T>): Promise<T> {
    if (request.purpose !== request.envelope.promptFamily)
      throw new AiPolicyError("AI purpose does not match prompt family");
    if (!request.consentGranted)
      throw new AiPolicyError("affirmative external AI consent is required");
    const findings = scanDlp(request.envelope.content);
    if (findings.length)
      throw new AiPolicyError(
        "prohibited content blocked before provider boundary",
        findings,
      );
    const prompt = buildPrompt(request.envelope);
    const started = performance.now();
    const result = await this.provider.invoke({
      ...prompt,
      model: request.model,
      mode: request.mode,
      maxOutputTokens: request.maxOutputTokens,
    });
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
        taskFamily: request.envelope.promptFamily,
        promptVersion: request.envelope.promptVersion,
        model: result.model,
        mode: request.mode,
        usage: result.usage,
        latencyMs: performance.now() - started,
        dlpFindingsCount: 0,
        schemaSuccess,
        retryCount: 0,
        estimatedCostUsd: cost,
      });
    }
  }
}
