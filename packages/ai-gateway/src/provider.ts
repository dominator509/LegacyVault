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
  retryCount: number;
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
  constructor(
    message: string,
    readonly retryCount = 0,
  ) {
    super(message);
  }
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

export interface DeepSeekEnvironment {
  DEEPSEEK_API_KEY?: string | undefined;
  DEEPSEEK_BASE_URL?: string | undefined;
  DEEPSEEK_MODEL?: string | undefined;
}

export function createDeepSeekRuntime(environment: DeepSeekEnvironment): {
  provider: DeepSeekProvider;
  model: string;
} {
  const model = environment.DEEPSEEK_MODEL ?? "";
  return {
    provider: new DeepSeekProvider({
      ...(environment.DEEPSEEK_API_KEY
        ? { apiKey: environment.DEEPSEEK_API_KEY }
        : {}),
      baseUrl: environment.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      model,
      timeoutMs: 30_000,
      maxRetries: 2,
    }),
    model,
  };
}

export class DeepSeekProvider implements AiProvider {
  readonly name = "deepseek";
  #failureCount = 0;
  #openUntil = 0;
  constructor(
    private readonly config: DeepSeekConfig,
    private readonly transport: typeof fetch = fetch,
  ) {
    const endpoint = new URL(config.baseUrl);
    const approvedProductionHost =
      endpoint.protocol === "https:" &&
      endpoint.hostname === "api.deepseek.com" &&
      (endpoint.port === "" || endpoint.port === "443") &&
      endpoint.username === "" &&
      endpoint.password === "";
    const approvedContractEndpoint =
      endpoint.protocol === "http:" &&
      new Set(["127.0.0.1", "localhost", "::1"]).has(endpoint.hostname) &&
      endpoint.username === "" &&
      endpoint.password === "";
    if (!approvedProductionHost && !approvedContractEndpoint)
      throw new Error("DeepSeek endpoint is not approved");
  }
  readiness() {
    if (!this.config.apiKey)
      return { configured: false, reason: "missing-api-key" };
    if (Date.now() < this.#openUntil)
      return { configured: false, reason: "circuit-open" };
    return { configured: true };
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
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = response.headers.get("retry-after");
          await response.body?.cancel();
          if (attempt < this.config.maxRetries) {
            await new Promise((resolve) =>
              setTimeout(resolve, retryDelayMs(retryAfter, attempt)),
            );
            continue;
          }
          lastError = new Error(`DeepSeek HTTP ${response.status}`);
          break;
        }
        if (!response.ok)
          throw new ProviderResponseError(`DeepSeek HTTP ${response.status}`);
        const body = (await response.json()) as {
          id?: string;
          model?: string;
          choices?: {
            finish_reason?: string;
            message?: { content?: string };
          }[];
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
            `DeepSeek response content is missing (${body.choices?.[0]?.finish_reason ?? "unknown"})`,
          );
        this.#failureCount = 0;
        const inputTokens = usageCounter(
          body.usage?.prompt_tokens,
          "prompt_tokens",
        );
        const outputTokens = usageCounter(
          body.usage?.completion_tokens,
          "completion_tokens",
        );
        const cacheHitTokens = usageCounter(
          body.usage?.prompt_cache_hit_tokens,
          "prompt_cache_hit_tokens",
        );
        const cacheMissTokens = usageCounter(
          body.usage?.prompt_cache_miss_tokens,
          "prompt_cache_miss_tokens",
        );
        return {
          content,
          model: body.model ?? request.model,
          usage: {
            inputTokens,
            outputTokens,
            cacheHitTokens,
            cacheMissTokens,
          },
          retryCount: attempt,
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
      this.config.maxRetries,
    );
  }
}

function usageCounter(value: number | undefined, field: string): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0)
    throw new ProviderResponseError(`DeepSeek ${field} is invalid`);
  return value;
}

function retryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.min(5_000, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date))
      return Math.min(5_000, Math.max(0, date - Date.now()));
  }
  return Math.min(2_000, 250 * 2 ** attempt);
}
