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
  organizationId: string;
  householdId: string;
  plan: "essential";
}

export interface NormalizedStripeSubscriptionEvent {
  organizationId: string;
  householdId: string;
  externalEventId: string;
  eventType: string;
  providerCreatedAt: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "paused";
  plan: "essential";
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
      "subscription_data[metadata][legacy_organization_id]":
        request.organizationId,
      "subscription_data[metadata][legacy_household_id]": request.householdId,
      "subscription_data[metadata][legacy_plan]": request.plan,
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
    const entries = signatureHeader
      .split(",")
      .map((part) => part.split("=", 2));
    const timestamp = Number(entries.find(([key]) => key === "t")?.[1]);
    const signatures = entries
      .filter(
        ([key, value]) => key === "v1" && /^[0-9a-f]{64}$/iu.test(value ?? ""),
      )
      .map(([, value]) => value as string);
    if (
      !Number.isSafeInteger(timestamp) ||
      signatures.length === 0 ||
      Math.abs(nowSeconds - timestamp) > 300
    )
      throw new Error("Stripe webhook signature timestamp invalid");
    const expected = createHmac("sha256", this.config.webhookSecret)
      .update(String(timestamp))
      .update(".")
      .update(payload)
      .digest("hex");
    const right = Buffer.from(expected, "hex");
    const valid = signatures.some((signature) => {
      const left = Buffer.from(signature, "hex");
      return left.length === right.length && timingSafeEqual(left, right);
    });
    if (!valid) throw new Error("Stripe webhook signature invalid");
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

  normalizeSubscriptionEvent(event: {
    id: string;
    type: string;
    created: number;
    data: unknown;
  }): NormalizedStripeSubscriptionEvent | undefined {
    if (
      ![
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ].includes(event.type)
    )
      return undefined;
    if (!event.data || typeof event.data !== "object")
      throw new Error("Stripe subscription event data invalid");
    const data = event.data as { object?: unknown };
    if (!data.object || typeof data.object !== "object")
      throw new Error("Stripe subscription object invalid");
    const object = data.object as Record<string, unknown>;
    const metadata =
      object.metadata && typeof object.metadata === "object"
        ? (object.metadata as Record<string, unknown>)
        : {};
    const organizationId = metadata.legacy_organization_id;
    const householdId = metadata.legacy_household_id;
    const plan = metadata.legacy_plan;
    const subscriptionId = object.id;
    const customerId = object.customer;
    const rawStatus =
      event.type === "customer.subscription.deleted"
        ? "canceled"
        : object.status;
    const allowedStatuses = [
      "trialing",
      "active",
      "past_due",
      "canceled",
      "unpaid",
      "paused",
    ] as const;
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
    if (
      typeof organizationId !== "string" ||
      !uuid.test(organizationId) ||
      typeof householdId !== "string" ||
      !uuid.test(householdId) ||
      plan !== "essential" ||
      typeof subscriptionId !== "string" ||
      typeof customerId !== "string" ||
      !allowedStatuses.includes(rawStatus as (typeof allowedStatuses)[number])
    )
      throw new Error("Stripe subscription metadata invalid");
    return {
      organizationId,
      householdId,
      externalEventId: event.id,
      eventType: event.type,
      providerCreatedAt: new Date(event.created * 1_000).toISOString(),
      providerCustomerId: customerId,
      providerSubscriptionId: subscriptionId,
      status: rawStatus as NormalizedStripeSubscriptionEvent["status"],
      plan,
    };
  }
}
