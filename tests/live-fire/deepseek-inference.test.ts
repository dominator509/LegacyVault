import { describe, expect, it } from "vitest";
import { DeepSeekProvider } from "../../packages/ai-gateway/src/provider.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const local = readLocalEnvironment();

describe("authenticated DeepSeek live fire", () => {
  it("returns schema-shaped JSON for synthetic non-customer content", async () => {
    const baseUrl = local.DEEPSEEK_BASE_URL ?? "";
    const endpoint = new URL(baseUrl);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.hostname !== "api.deepseek.com"
    )
      throw new Error("DeepSeek live-fire endpoint is not the approved host");
    if (!local.DEEPSEEK_API_KEY)
      throw new Error("DeepSeek live-fire key is not configured");
    const provider = new DeepSeekProvider({
      apiKey: local.DEEPSEEK_API_KEY,
      baseUrl,
      model: local.DEEPSEEK_MODEL ?? "",
      timeoutMs: 30_000,
      maxRetries: 1,
    });
    expect(provider.readiness()).toEqual({ configured: true });
    const result = await provider.invoke({
      stablePrefix:
        'Return only a JSON object matching {"status":"ok"}. Do not add keys.',
      volatileContent:
        "Synthetic integration probe. No customer data is present.",
      model: local.DEEPSEEK_MODEL ?? "",
      mode: "standard",
      maxOutputTokens: 256,
    });
    expect(JSON.parse(result.content)).toEqual({ status: "ok" });
    expect(result.model.length).toBeGreaterThan(0);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.retryCount).toBeGreaterThanOrEqual(0);
  }, 45_000);
});
