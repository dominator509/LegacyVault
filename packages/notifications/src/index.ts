export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}
export interface EmailConfig {
  apiKey?: string;
  from: string;
  baseUrl?: string;
  timeoutMs: number;
  maxAttempts?: number;
}

export class EmailProviderError extends Error {
  override readonly name = "EmailProviderError";
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly retryCount: number,
  ) {
    super(message);
  }
}

export class ResendEmailAdapter {
  constructor(
    private readonly config: EmailConfig,
    private readonly transport: typeof fetch = fetch,
    private readonly wait: (milliseconds: number) => Promise<void> = (
      milliseconds,
    ) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}
  readiness() {
    return this.config.apiKey && this.config.from
      ? { configured: true }
      : { configured: false, reason: "email-configuration-incomplete" };
  }
  async send(message: EmailMessage): Promise<{ id: string }> {
    if (!this.config.apiKey) throw new Error("Resend is not configured");
    for (const value of [message.to, message.subject, this.config.from])
      if (/\r|\n/u.test(value))
        throw new Error("email header injection blocked");
    const endpoint = new URL(
      "emails",
      this.config.baseUrl ?? "https://api.resend.com/",
    );
    if (
      endpoint.protocol !== "https:" ||
      endpoint.hostname !== "api.resend.com"
    )
      throw new Error("Resend endpoint is invalid");
    const maxAttempts = this.config.maxAttempts ?? 3;
    if (
      !Number.isSafeInteger(maxAttempts) ||
      maxAttempts < 1 ||
      maxAttempts > 5
    )
      throw new Error("Resend max attempts is invalid");
    let lastStatus: number | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.transport(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            "content-type": "application/json",
            "idempotency-key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from: this.config.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
          signal: controller.signal,
        });
        lastStatus = response.status;
        if (response.ok) {
          const result = (await response.json()) as { id?: unknown };
          if (typeof result.id !== "string" || result.id.length < 1)
            throw new EmailProviderError(
              "Resend response invalid",
              response.status,
              attempt,
            );
          return { id: result.id };
        }
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt + 1 >= maxAttempts)
          throw new EmailProviderError(
            `Resend HTTP ${response.status}`,
            response.status,
            attempt,
          );
        const retryAfter = Number(response.headers.get("retry-after"));
        await this.wait(
          Number.isFinite(retryAfter)
            ? Math.min(Math.max(retryAfter * 1_000, 0), 2_000)
            : Math.min(100 * 2 ** attempt, 2_000),
        );
      } catch (error) {
        if (error instanceof EmailProviderError) throw error;
        if (attempt + 1 >= maxAttempts)
          throw new EmailProviderError(
            "Resend transport unavailable",
            lastStatus,
            attempt,
          );
        await this.wait(Math.min(100 * 2 ** attempt, 2_000));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new EmailProviderError("Resend delivery failed", lastStatus, 0);
  }
}

export class LocalSmtpCaptureAdapter {
  constructor(
    private readonly config: {
      host: string;
      port: number;
      from: string;
      timeoutMs: number;
    },
  ) {
    if (config.host !== "127.0.0.1" && config.host !== "localhost")
      throw new Error("SMTP capture adapter is restricted to loopback");
  }

  async send(message: EmailMessage): Promise<{ id: string }> {
    for (const value of [message.to, message.subject, this.config.from])
      if (/\r|\n/u.test(value))
        throw new Error("email header injection blocked");
    const messageId = `<${message.idempotencyKey}@legacy-vault.local>`;
    const socket = net.createConnection({
      host: this.config.host,
      port: this.config.port,
      timeout: this.config.timeoutMs,
    });
    const lines = createInterface({ input: socket, crlfDelay: Infinity })[
      Symbol.asyncIterator
    ]();
    const readReply = async (expected: number): Promise<void> => {
      for (;;) {
        const next = await lines.next();
        if (next.done) throw new Error("SMTP connection ended before reply");
        const match = /^(\d{3})([ -])/u.exec(next.value);
        if (!match || match[2] === "-") continue;
        if (Number(match[1]) !== expected)
          throw new Error(`SMTP reply ${match[1]}`);
        return;
      }
    };
    const command = async (value: string, expected: number): Promise<void> => {
      socket.write(`${value}\r\n`);
      await readReply(expected);
    };
    try {
      await readReply(220);
      await command("EHLO legacy-vault.local", 250);
      await command(`MAIL FROM:<${this.config.from}>`, 250);
      await command(`RCPT TO:<${message.to}>`, 250);
      await command("DATA", 354);
      const dotStuff = (value: string) =>
        value.replace(/\r?\n/gu, "\r\n").replace(/^\./gmu, "..");
      socket.write(
        `From: ${this.config.from}\r\nTo: ${message.to}\r\nSubject: ${message.subject}\r\nMessage-ID: ${messageId}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=legacy-vault-boundary\r\n\r\n--legacy-vault-boundary\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${dotStuff(message.text)}\r\n--legacy-vault-boundary\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${dotStuff(message.html)}\r\n--legacy-vault-boundary--\r\n.\r\n`,
      );
      await readReply(250);
      await command("QUIT", 221);
      return { id: messageId };
    } finally {
      socket.destroy();
      lines.return?.();
    }
  }
}
import net from "node:net";
import { createInterface } from "node:readline";
