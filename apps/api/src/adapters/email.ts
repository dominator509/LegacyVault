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
}

export class ResendEmailAdapter {
  constructor(
    private readonly config: EmailConfig,
    private readonly transport: typeof fetch = fetch,
  ) {}
  readiness() {
    return this.config.apiKey && this.config.from
      ? { configured: true }
      : { configured: false, reason: "email-configuration-incomplete" };
  }
  async send(message: EmailMessage): Promise<{ id: string }> {
    if (!this.config.apiKey) throw new Error("Resend is not configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.transport(
        new URL("emails", this.config.baseUrl ?? "https://api.resend.com/"),
        {
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
        },
      );
      if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
      const result = (await response.json()) as { id?: string };
      if (!result.id) throw new Error("Resend response invalid");
      return { id: result.id };
    } finally {
      clearTimeout(timer);
    }
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
