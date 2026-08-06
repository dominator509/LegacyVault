import { describe, expect, it } from "vitest";
import {
  EmailProviderError,
  ResendEmailAdapter,
} from "../../packages/notifications/src/index.js";

const message = {
  to: "recipient@example.test",
  subject: "Annual review ready",
  text: "Sign in to review.",
  html: "<p>Sign in to review.</p>",
  idempotencyKey: "notification-idempotency-key",
};

describe("Resend email adapter", () => {
  it("constructs the authenticated idempotent request and validates the response", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const adapter = new ResendEmailAdapter(
      {
        apiKey: "test-resend-key",
        from: "Legacy Vault <notices@example.test>",
        timeoutMs: 1_000,
      },
      async (url, init) => {
        requests.push({ url: url.toString(), init });
        return new Response(JSON.stringify({ id: "email_123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );
    await expect(adapter.send(message)).resolves.toEqual({ id: "email_123" });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.resend.com/emails");
    expect(requests[0]?.init?.headers).toMatchObject({
      authorization: "Bearer test-resend-key",
      "idempotency-key": message.idempotencyKey,
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      from: "Legacy Vault <notices@example.test>",
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  });

  it("retries rate limits with bounded delay and reports the retry count", async () => {
    const waits: number[] = [];
    let attempts = 0;
    const adapter = new ResendEmailAdapter(
      {
        apiKey: "test-resend-key",
        from: "notices@example.test",
        timeoutMs: 1_000,
        maxAttempts: 2,
      },
      async () => {
        attempts += 1;
        return new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "30" },
        });
      },
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    );
    await expect(adapter.send(message)).rejects.toMatchObject({
      name: "EmailProviderError",
      status: 429,
      retryCount: 1,
    } satisfies Partial<EmailProviderError>);
    expect(attempts).toBe(2);
    expect(waits).toEqual([2_000]);
  });

  it("blocks header injection before the provider boundary", async () => {
    let called = false;
    const adapter = new ResendEmailAdapter(
      {
        apiKey: "test-resend-key",
        from: "notices@example.test",
        timeoutMs: 1_000,
      },
      async () => {
        called = true;
        return new Response(JSON.stringify({ id: "unexpected" }));
      },
    );
    await expect(
      adapter.send({
        ...message,
        subject: "safe\r\nBcc: attacker@example.test",
      }),
    ).rejects.toThrow("email header injection blocked");
    expect(called).toBe(false);
  });
});
