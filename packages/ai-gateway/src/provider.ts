export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
}
export interface ProviderResult {
  content: string;
  model: string;
  usage: ProviderUsage;
  requestId?: string;
}
export interface ProviderRequest {
  stablePrefix: string;
  volatileContent: string;
  model: string;
  mode: "standard" | "thinking";
  maxOutputTokens: number;
}
export interface AiProvider {
  readonly name: string;
  invoke(request: ProviderRequest): Promise<ProviderResult>;
  readiness(): { configured: boolean; reason?: string };
}

export class ProviderUnavailableError extends Error {
  override readonly name = "ProviderUnavailableError";
}
export class ProviderResponseError extends Error {
  override readonly name = "ProviderResponseError";
}

export interface DeepSeekConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
}

export class DeepSeekProvider implements AiProvider {
  readonly name = "deepseek";
  #failureCount = 0;
  #openUntil = 0;
  constructor(
    private readonly config: DeepSeekConfig,
    private readonly transport: typeof fetch = fetch,
  ) {}
  readiness() {
    return this.config.apiKey
      ? { configured: true }
      : { configured: false, reason: "missing-api-key" };
  }

  async invoke(request: ProviderRequest): Promise<ProviderResult> {
    if (!this.config.apiKey)
      throw new ProviderUnavailableError("DeepSeek is not configured");
    if (Date.now() < this.#openUntil)
      throw new ProviderUnavailableError("DeepSeek circuit is open");
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.transport(
          new URL(
            "chat/completions",
            this.config.baseUrl.endsWith("/")
              ? this.config.baseUrl
              : `${this.config.baseUrl}/`,
          ),
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${this.config.apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: request.model || this.config.model,
              messages: [
                { role: "system", content: request.stablePrefix },
                { role: "user", content: request.volatileContent },
              ],
              max_tokens: request.maxOutputTokens,
              response_format: { type: "json_object" },
              ...(request.mode === "thinking"
                ? { thinking: { type: "enabled" } }
                : {}),
            }),
            signal: controller.signal,
          },
        );
        if (
          (response.status === 429 || response.status >= 500) &&
          attempt < this.config.maxRetries
        ) {
          await response.body?.cancel();
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(2_000, 250 * 2 ** attempt)),
          );
          continue;
        }
        if (!response.ok)
          throw new ProviderResponseError(`DeepSeek HTTP ${response.status}`);
        const body = (await response.json()) as {
          id?: string;
          model?: string;
          choices?: { message?: { content?: string } }[];
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            prompt_cache_hit_tokens?: number;
            prompt_cache_miss_tokens?: number;
          };
        };
        const content = body.choices?.[0]?.message?.content;
        if (!content)
          throw new ProviderResponseError(
            "DeepSeek response content is missing",
          );
        this.#failureCount = 0;
        return {
          content,
          model: body.model ?? request.model,
          usage: {
            inputTokens: body.usage?.prompt_tokens ?? 0,
            outputTokens: body.usage?.completion_tokens ?? 0,
            cacheHitTokens: body.usage?.prompt_cache_hit_tokens ?? 0,
            cacheMissTokens: body.usage?.prompt_cache_miss_tokens ?? 0,
          },
          ...(body.id ? { requestId: body.id } : {}),
        };
      } catch (error) {
        lastError = error;
        if (error instanceof ProviderResponseError) throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    this.#failureCount += 1;
    if (this.#failureCount >= 3) this.#openUntil = Date.now() + 30_000;
    throw new ProviderUnavailableError(
      lastError instanceof Error ? lastError.name : "DeepSeek request failed",
    );
  }
}
