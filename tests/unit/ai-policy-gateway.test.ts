import { describe, expect, it } from "vitest";
import {
  AiPolicyError,
  AiPolicyGateway,
  buildPrompt,
  scanDlp,
  z,
} from "../../packages/ai-gateway/src/index.js";
import { RecordingAiProvider } from "./doubles/ai-provider.js";

const envelope = {
  promptFamily: "document-classification",
  promptVersion: "1.0.0",
  globalPolicy: "Return evidence-linked candidates only.",
  taskPolicy: "Classify the supplied minimized excerpt.",
  outputSchema: { type: "object", required: ["category"] },
  safeHouseholdCapsule: { categories: ["insurance"] },
  content: "Policy issued by Example Mutual.",
};
const result = {
  content: JSON.stringify({ category: "insurance" }),
  model: "contract-model",
  usage: {
    inputTokens: 100,
    outputTokens: 10,
    cacheHitTokens: 80,
    cacheMissTokens: 20,
  },
};

describe("AI policy gateway", () => {
  it("detects prohibited secret categories deterministically", () => {
    expect(scanDlp("password: hunter2 and SSN 123-45-6789")).toEqual([
      "complete-ssn",
      "password",
    ]);
    expect(scanDlp("card 4242 4242 4242 4242")).toContain("payment-card");
  });

  it("blocks prohibited content before the provider boundary", async () => {
    const provider = new RecordingAiProvider(result);
    const gateway = new AiPolicyGateway(provider, () => undefined);
    await expect(
      gateway.execute({
        organizationId: "org-1",
        householdId: "house-1",
        purpose: envelope.promptFamily,
        consentGranted: true,
        envelope: { ...envelope, content: "PIN: 1234" },
        schema: z.object({ category: z.string() }),
        mode: "standard",
        model: "contract-model",
        maxOutputTokens: 100,
        estimatedInputCostPerMillion: 1,
        estimatedOutputCostPerMillion: 1,
      }),
    ).rejects.toBeInstanceOf(AiPolicyError);
    expect(provider.requests).toHaveLength(0);
  });

  it("requires affirmative purpose-matched consent", async () => {
    const provider = new RecordingAiProvider(result);
    const gateway = new AiPolicyGateway(provider, () => undefined);
    await expect(
      gateway.execute({
        organizationId: "org-1",
        householdId: "house-1",
        purpose: envelope.promptFamily,
        consentGranted: false,
        envelope,
        schema: z.object({ category: z.string() }),
        mode: "standard",
        model: "contract-model",
        maxOutputTokens: 100,
        estimatedInputCostPerMillion: 1,
        estimatedOutputCostPerMillion: 1,
      }),
    ).rejects.toThrow(/consent/u);
    expect(provider.requests).toHaveLength(0);
  });

  it("uses canonical stable prefixes and validates structured output", async () => {
    const metrics: unknown[] = [];
    const provider = new RecordingAiProvider(result);
    const gateway = new AiPolicyGateway(provider, (metric) =>
      metrics.push(metric),
    );
    await expect(
      gateway.execute({
        organizationId: "org-1",
        householdId: "house-1",
        purpose: envelope.promptFamily,
        consentGranted: true,
        envelope,
        schema: z.object({ category: z.literal("insurance") }),
        mode: "standard",
        model: "contract-model",
        maxOutputTokens: 100,
        estimatedInputCostPerMillion: 1,
        estimatedOutputCostPerMillion: 2,
      }),
    ).resolves.toEqual({ category: "insurance" });
    expect(provider.requests[0]?.stablePrefix).toBe(
      buildPrompt(envelope).stablePrefix,
    );
    expect(metrics).toHaveLength(1);
  });

  it("isolates exact cache keys between tenants", () => {
    const gateway = new AiPolicyGateway(
      new RecordingAiProvider(result),
      () => undefined,
    );
    expect(
      gateway.cacheKey({
        organizationId: "org-1",
        householdId: "house-1",
        envelope,
      }),
    ).not.toBe(
      gateway.cacheKey({
        organizationId: "org-2",
        householdId: "house-1",
        envelope,
      }),
    );
  });
});
