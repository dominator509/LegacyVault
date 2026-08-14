import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ResendEmailAdapter } from "../../packages/notifications/src/index.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

interface ResendEmailRecord {
  id?: string;
  from?: string;
  to?: string[];
  subject?: string;
}

const local = readLocalEnvironment();

describe("authenticated Resend sandbox live fire", () => {
  it("sends and retrieves one synthetic provider-owned test message", async () => {
    const apiKey = local.RESEND_API_KEY ?? "";
    if (!/^re_[A-Za-z0-9_-]+$/u.test(apiKey))
      throw new Error("Resend live-fire requires an API key");

    const runId = randomUUID();
    const from = "Legacy Vault <onboarding@resend.dev>";
    const to = `delivered+legacyvault-${runId}@resend.dev`;
    const subject = `LegacyVault synthetic Resend live fire ${runId}`;
    const adapter = new ResendEmailAdapter({
      apiKey,
      from,
      timeoutMs: 20_000,
      maxAttempts: 3,
    });
    const sent = await adapter.send({
      to,
      subject,
      text: `Synthetic provider test only. Run ${runId}.`,
      html: `<p>Synthetic provider test only. Run ${runId}.</p>`,
      idempotencyKey: `resend-live-fire-${runId}`,
    });
    expect(sent.id).toMatch(/^[0-9a-f-]{36}$/u);

    const response = await fetch(
      new URL(`emails/${sent.id}`, "https://api.resend.com/"),
      {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok)
      throw new Error(`Resend retrieve live-fire HTTP ${response.status}`);
    const record = (await response.json()) as ResendEmailRecord;
    expect(record).toMatchObject({
      id: sent.id,
      from,
      to: [to],
      subject,
    });
  }, 60_000);
});
