import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { DeepSeekProvider } from "../../packages/ai-gateway/src/provider.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () =>
  Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  ),
);

describe("DeepSeek HTTP contract", () => {
  it("constructs authenticated structured requests and validates usage fields", async () => {
    let receivedAuthorization = "";
    let receivedBody: unknown;
    const server = createServer((request, response) => {
      receivedAuthorization = request.headers.authorization ?? "";
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: "request-1",
            model: "deepseek-contract",
            choices: [
              {
                message: { content: JSON.stringify({ category: "insurance" }) },
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 10,
              prompt_cache_hit_tokens: 80,
              prompt_cache_miss_tokens: 20,
            },
          }),
        );
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    const provider = new DeepSeekProvider({
      apiKey: "contract-test-key",
      baseUrl: `http://127.0.0.1:${address.port}/`,
      model: "deepseek-contract",
      timeoutMs: 2_000,
      maxRetries: 0,
    });
    const result = await provider.invoke({
      stablePrefix: "stable-policy",
      volatileContent: "minimized content",
      model: "deepseek-contract",
      mode: "standard",
      maxOutputTokens: 200,
    });
    expect(receivedAuthorization).toBe("Bearer contract-test-key");
    expect(receivedBody).toMatchObject({
      model: "deepseek-contract",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "stable-policy" },
        { role: "user", content: "minimized content" },
      ],
    });
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 10,
      cacheHitTokens: 80,
      cacheMissTokens: 20,
    });
  });

  it("retries one transient server response within the configured bound", async () => {
    let attempts = 0;
    const server = createServer((_request, response) => {
      attempts += 1;
      if (attempts === 1) {
        response.writeHead(503);
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          model: "deepseek-contract",
          choices: [{ message: { content: "{}" } }],
          usage: {},
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    const provider = new DeepSeekProvider({
      apiKey: "contract-test-key",
      baseUrl: `http://127.0.0.1:${address.port}/`,
      model: "deepseek-contract",
      timeoutMs: 2_000,
      maxRetries: 1,
    });
    await expect(
      provider.invoke({
        stablePrefix: "policy",
        volatileContent: "content",
        model: "deepseek-contract",
        mode: "standard",
        maxOutputTokens: 50,
      }),
    ).resolves.toMatchObject({ content: "{}" });
    expect(attempts).toBe(2);
  });
});
