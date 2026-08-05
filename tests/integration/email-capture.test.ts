import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LocalSmtpCaptureAdapter } from "../../apps/api/src/adapters/email.js";

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

describe("real local SMTP capture", () => {
  it("captures recipient, subject, text, HTML, and stable message identity", async () => {
    const suffix = randomUUID();
    const recipient = `recipient-${suffix}@localhost.invalid`;
    const subject = `Annual review ${suffix}`;
    const text = `Review link expires in 30 minutes. Token ${suffix}.`;
    const html = `<p>Review link expires in 30 minutes.</p><a href="http://127.0.0.1:3000/review/${suffix}">Review</a>`;
    const adapter = new LocalSmtpCaptureAdapter({
      host: "127.0.0.1",
      port: 1025,
      from: "notices@localhost.invalid",
      timeoutMs: 5_000,
    });
    const sent = await adapter.send({
      to: recipient,
      subject,
      text,
      html,
      idempotencyKey: suffix,
    });
    expect(sent.id).toBe(`<${suffix}@legacy-vault.local>`);

    const response = await fetch("http://127.0.0.1:8025/api/v1/messages");
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { messages?: MailpitSummary[] };
    const summary = body.messages?.find(
      (message) => message.Subject === subject,
    );
    expect(summary?.To.map((entry) => entry.Address)).toContain(recipient);
    expect(summary?.ID).toBeTruthy();
    const capturedText = await fetch(
      `http://127.0.0.1:8025/view/${summary?.ID}.txt`,
    );
    const capturedHtml = await fetch(
      `http://127.0.0.1:8025/view/${summary?.ID}.html`,
    );
    await expect(capturedText.text()).resolves.toContain(text);
    await expect(capturedHtml.text()).resolves.toContain(`/review/${suffix}`);
  });
});
