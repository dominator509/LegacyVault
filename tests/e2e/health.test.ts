import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";

const server = buildServer();
let baseUrl = "";

beforeAll(async () => {
  await server.listen({ host: "127.0.0.1", port: 0 });
  const address = server.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await server.close();
});

describe("API health entry points", () => {
  it("serves liveness over a real TCP listener", async () => {
    const response = await fetch(`${baseUrl}/health/live`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "live" });
  });

  it("fails readiness closed when required dependencies are not configured", async () => {
    const response = await fetch(`${baseUrl}/health/ready`);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "not-ready",
      reason: "database-unconfigured",
    });
  });
});
