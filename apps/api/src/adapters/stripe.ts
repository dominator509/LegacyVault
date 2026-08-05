import { createHmac, timingSafeEqual } from "node:crypto";

export interface StripeConfig {
  secretKey?: string;
  webhookSecret?: string;
  essentialPriceId?: string;
  baseUrl?: string;
  timeoutMs: number;
}
export interface CheckoutRequest {
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}

export class StripeAdapter {
  constructor(
    private readonly config: StripeConfig,
    private readonly transport: typeof fetch = fetch,
  ) {}
  readiness() {
    return this.config.secretKey &&
      this.config.webhookSecret &&
      this.config.essentialPriceId
      ? { configured: true }
      : { configured: false, reason: "billing-configuration-incomplete" };
  }

  async createCheckout(
    request: CheckoutRequest,
  ): Promise<{ id: string; url: string }> {
    if (!this.config.secretKey || !this.config.essentialPriceId)
      throw new Error("Stripe is not configured");
    const body = new URLSearchParams({
      customer: request.customerId,
      mode: "subscription",
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      "line_items[0][price]": this.config.essentialPriceId,
      "line_items[0][quantity]": "1",
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.transport(
        new URL(
          "v1/checkout/sessions",
          this.config.baseUrl ?? "https://api.stripe.com/",
        ),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.secretKey}`,
            "content-type": "application/x-www-form-urlencoded",
            "idempotency-key": request.idempotencyKey,
          },
          body,
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error(`Stripe HTTP ${response.status}`);
      const result = (await response.json()) as { id?: string; url?: string };
      if (!result.id || !result.url)
        throw new Error("Stripe checkout response invalid");
      return { id: result.id, url: result.url };
    } finally {
      clearTimeout(timer);
    }
  }

  verifyWebhook(
    payload: Uint8Array,
    signatureHeader: string,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): { id: string; type: string; created: number; data: unknown } {
    if (!this.config.webhookSecret)
      throw new Error("Stripe webhook is not configured");
    const entries = Object.fromEntries(
      signatureHeader
        .split(",")
        .map((part) => part.split("=", 2) as [string, string]),
    );
    const timestamp = Number(entries.t);
    const signature = entries.v1;
    if (
      !Number.isSafeInteger(timestamp) ||
      !signature ||
      Math.abs(nowSeconds - timestamp) > 300
    )
      throw new Error("Stripe webhook signature timestamp invalid");
    const expected = createHmac("sha256", this.config.webhookSecret)
      .update(String(timestamp))
      .update(".")
      .update(payload)
      .digest("hex");
    const left = Buffer.from(signature, "hex");
    const right = Buffer.from(expected, "hex");
    if (left.length !== right.length || !timingSafeEqual(left, right))
      throw new Error("Stripe webhook signature invalid");
    const event = JSON.parse(Buffer.from(payload).toString("utf8")) as {
      id?: string;
      type?: string;
      created?: number;
      data?: unknown;
    };
    if (!event.id || !event.type || !event.created)
      throw new Error("Stripe webhook event invalid");
    return {
      id: event.id,
      type: event.type,
      created: event.created,
      data: event.data,
    };
  }
}
