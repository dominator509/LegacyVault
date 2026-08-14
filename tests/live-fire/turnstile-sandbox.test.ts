import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readLocalEnvironment } from "../helpers/local-environment.js";

interface SiteverifyResult {
  success?: boolean;
  hostname?: string;
  "error-codes"?: string[];
}

const local = readLocalEnvironment();
const testingSitekey = "1x00000000000000000000AA";
const testingSecret = "1x0000000000000000000000000000000AA";
const failingTestingSecret = "2x0000000000000000000000000000000AA";

async function siteverify(
  secret: string,
  token: string,
): Promise<SiteverifyResult> {
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: "127.0.0.1",
        idempotency_key: randomUUID(),
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok)
    throw new Error(`Turnstile Siteverify HTTP ${response.status}`);
  return (await response.json()) as SiteverifyResult;
}

describe("Cloudflare Turnstile public testing pairs", () => {
  it("proves deterministic pass and fail Siteverify behavior", async () => {
    if (local.TURNSTILE_SITE_KEY !== testingSitekey)
      throw new Error(
        "Turnstile live-fire requires Cloudflare's public testing sitekey",
      );
    if (local.TURNSTILE_SECRET_KEY !== testingSecret)
      throw new Error(
        "Turnstile live-fire requires Cloudflare's public testing secret",
      );

    await expect(
      siteverify(testingSecret, "XXXX.DUMMY.TOKEN.XXXX"),
    ).resolves.toMatchObject({
      success: true,
      "error-codes": [],
    });
    const rejected = await siteverify(
      failingTestingSecret,
      "XXXX.DUMMY.TOKEN.XXXX",
    );
    expect(rejected.success).toBe(false);
    expect(rejected["error-codes"]?.length).toBeGreaterThan(0);
  }, 60_000);
});
