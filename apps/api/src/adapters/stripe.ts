import { createHmac, timingSafeEqual } from "node:crypto";

export interface StripeConfig {
  secretKey?: string;
  webhookSecret?: string;
  essentialPriceId?: string;
  baseUrl?: string;
  timeoutMs: number;
}
export interface CheckoutRequest {
  clientReferenceId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  organizationId: string;
  householdId: string;
  plan: "essential";
}

export interface BillingPortalRequest {
  customerId: string;
  returnUrl: string;
  idempotencyKey: string;
}

export interface NormalizedStripeSubscriptionEvent {
  organizationId: string;
  householdId: string;
  externalEventId: string;
  eventType: string;
  providerCreatedAt: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  status:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "paused";
  plan: "essential";
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

export interface NormalizedStripeRefundEvent {
  organizationId: string;
  householdId: string;
  externalEventId: string;
  eventType: string;
  providerUpdatedAt: string;
  providerRefundId: string;
  providerChargeId: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled";
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
      client_reference_id: request.clientReferenceId,
      mode: "subscription",
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      "line_items[0][price]": this.config.essentialPriceId,
      "line_items[0][quantity]": "1",
      "metadata[legacy_organization_id]": request.organizationId,
      "metadata[legacy_household_id]": request.householdId,
      "metadata[legacy_plan]": request.plan,
      "subscription_data[metadata][legacy_organization_id]":
        request.organizationId,
      "subscription_data[metadata][legacy_household_id]": request.householdId,
      "subscription_data[metadata][legacy_plan]": request.plan,
    });
    const result = await this.postForm(
      "v1/checkout/sessions",
      body,
      request.idempotencyKey,
    );
    if (typeof result.id !== "string" || typeof result.url !== "string")
      throw new Error("Stripe checkout response invalid");
    const checkoutUrl = new URL(result.url);
    if (
      checkoutUrl.protocol !== "https:" ||
      (!checkoutUrl.hostname.endsWith(".stripe.com") &&
        !checkoutUrl.hostname.endsWith(".stripe.test"))
    )
      throw new Error("Stripe checkout URL invalid");
    return { id: result.id, url: result.url };
  }

  async createBillingPortal(
    request: BillingPortalRequest,
  ): Promise<{ id: string; url: string }> {
    if (!this.config.secretKey) throw new Error("Stripe is not configured");
    if (!/^cus_[A-Za-z0-9]+$/u.test(request.customerId))
      throw new Error("Stripe customer identifier invalid");
    const returnUrl = new URL(request.returnUrl);
    if (returnUrl.protocol !== "https:")
      throw new Error("Stripe portal return URL invalid");
    const result = await this.postForm(
      "v1/billing_portal/sessions",
      new URLSearchParams({
        customer: request.customerId,
        return_url: returnUrl.toString(),
      }),
      request.idempotencyKey,
    );
    if (typeof result.id !== "string" || typeof result.url !== "string")
      throw new Error("Stripe billing portal response invalid");
    const portalUrl = new URL(result.url);
    if (
      portalUrl.protocol !== "https:" ||
      (portalUrl.hostname !== "billing.stripe.com" &&
        !portalUrl.hostname.endsWith(".stripe.test"))
    )
      throw new Error("Stripe billing portal URL invalid");
    return { id: result.id, url: result.url };
  }

  private async postForm(
    path: string,
    body: URLSearchParams,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    if (!this.config.secretKey) throw new Error("Stripe is not configured");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.transport(
          new URL(path, this.config.baseUrl ?? "https://api.stripe.com/"),
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${this.config.secretKey}`,
              "content-type": "application/x-www-form-urlencoded",
              "idempotency-key": idempotencyKey,
            },
            body,
            signal: controller.signal,
          },
        );
        if (response.ok) {
          const result: unknown = await response.json();
          if (!result || typeof result !== "object" || Array.isArray(result))
            throw new Error("Stripe response invalid");
          return result as Record<string, unknown>;
        }
        const retryable =
          response.status === 429 ||
          [500, 502, 503, 504].includes(response.status);
        if (!retryable || attempt === 2)
          throw new Error(`Stripe HTTP ${response.status}`);
      } catch (error) {
        const retryableTransportError =
          error instanceof Error &&
          (error.name === "AbortError" || error.name === "TypeError");
        if (attempt === 2 || !retryableTransportError) throw error;
      } finally {
        clearTimeout(timer);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(250 * 2 ** attempt, 1_000)),
      );
    }
    throw new Error("Stripe request exhausted retries");
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
      "incomplete",
      "incomplete_expired",
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
      trialEndsAt: stripeTimestamp(object.trial_end),
      currentPeriodEndsAt: stripeTimestamp(object.current_period_end),
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
      canceledAt: stripeTimestamp(object.canceled_at),
    };
  }

  normalizeRefundEvent(event: {
    id: string;
    type: string;
    created: number;
    data: unknown;
  }): NormalizedStripeRefundEvent | undefined {
    if (
      !["refund.created", "refund.updated", "refund.failed"].includes(
        event.type,
      )
    )
      return undefined;
    if (!event.data || typeof event.data !== "object")
      throw new Error("Stripe refund event data invalid");
    const data = event.data as { object?: unknown };
    if (!data.object || typeof data.object !== "object")
      throw new Error("Stripe refund object invalid");
    const object = data.object as Record<string, unknown>;
    const metadata =
      object.metadata && typeof object.metadata === "object"
        ? (object.metadata as Record<string, unknown>)
        : {};
    const organizationId = metadata.legacy_organization_id;
    const householdId = metadata.legacy_household_id;
    const refundId = object.id;
    const chargeId = object.charge;
    const amount = object.amount;
    const currency = object.currency;
    const reason = object.reason;
    const status = object.status;
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
    const allowedStatuses = [
      "pending",
      "requires_action",
      "succeeded",
      "failed",
      "canceled",
    ] as const;
    if (
      typeof organizationId !== "string" ||
      !uuid.test(organizationId) ||
      typeof householdId !== "string" ||
      !uuid.test(householdId) ||
      typeof refundId !== "string" ||
      !/^re_[A-Za-z0-9]+$/u.test(refundId) ||
      (chargeId !== null &&
        chargeId !== undefined &&
        typeof chargeId !== "string") ||
      !Number.isSafeInteger(amount) ||
      (amount as number) < 1 ||
      typeof currency !== "string" ||
      !/^[a-z]{3}$/u.test(currency) ||
      (reason !== null && reason !== undefined && typeof reason !== "string") ||
      !allowedStatuses.includes(status as (typeof allowedStatuses)[number])
    )
      throw new Error("Stripe refund metadata invalid");
    return {
      organizationId,
      householdId,
      externalEventId: event.id,
      eventType: event.type,
      providerUpdatedAt: new Date(event.created * 1_000).toISOString(),
      providerRefundId: refundId,
      providerChargeId: typeof chargeId === "string" ? chargeId : null,
      amount: amount as number,
      currency,
      reason: typeof reason === "string" ? reason : null,
      status: status as NormalizedStripeRefundEvent["status"],
    };
  }
}

function stripeTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new Error("Stripe subscription timestamp invalid");
  return new Date((value as number) * 1_000).toISOString();
}
