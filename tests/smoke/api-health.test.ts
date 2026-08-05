import { describe, expect, it } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";

describe("API smoke", () => {
  it("constructs the real Fastify application and answers liveness", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "GET",
      url: "/health/live",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "live" });
    await server.close();
  });
});
