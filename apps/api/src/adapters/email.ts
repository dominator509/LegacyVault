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
