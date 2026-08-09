import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StripeAdapter } from "../../apps/api/src/adapters/stripe.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

interface StripeCheckoutSession {
  id?: string;
  mode?: string;
  status?: string;
  payment_status?: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
  line_items?: { data?: { price?: { id?: string } }[] };
}

interface StripeCustomer {
  id?: string;
  deleted?: boolean;
}

const local = readLocalEnvironment();

async function stripeRequest(
  secretKey: string,
  path: string,
  method: "DELETE" | "GET" | "POST",
  body = new URLSearchParams(),
): Promise<StripeCheckoutSession & StripeCustomer> {
  const response = await fetch(new URL(path, "https://api.stripe.com/"), {
    method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      ...(method === "POST"
        ? { "content-type": "application/x-www-form-urlencoded" }
        : {}),
    },
    ...(method === "POST" ? { body } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Stripe live-fire HTTP ${response.status}`);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Stripe live-fire response invalid");
  return value as StripeCheckoutSession & StripeCustomer;
}

describe("authenticated Stripe sandbox live fire", () => {
  it("creates, verifies and expires a synthetic subscription Checkout Session", async () => {
    const secretKey = local.STRIPE_SECRET_KEY ?? "";
    const webhookSecret = local.STRIPE_WEBHOOK_SECRET ?? "";
    const priceId = local.STRIPE_PRICE_ESSENTIAL ?? "";
    if (!/^sk_test_[A-Za-z0-9]+$/u.test(secretKey))
      throw new Error("Stripe live-fire requires a test-mode secret key");
    if (!/^whsec_[A-Za-z0-9]+$/u.test(webhookSecret))
      throw new Error("Stripe live-fire webhook secret is not configured");
    if (!/^price_[A-Za-z0-9]+$/u.test(priceId))
      throw new Error("Stripe live-fire Price is not configured");

    const organizationId = randomUUID();
    const householdId = randomUUID();
    const clientReferenceId = `synthetic-live-fire-${randomUUID()}`;
    const adapter = new StripeAdapter({
      secretKey,
      webhookSecret,
      essentialPriceId: priceId,
      timeoutMs: 20_000,
    });
    let sessionId: string | undefined;
    let expired = false;
    try {
      const created = await adapter.createCheckout({
        clientReferenceId,
        successUrl: "https://app.example.invalid/billing/success",
        cancelUrl: "https://app.example.invalid/billing/cancel",
        idempotencyKey: `stripe-live-fire-${randomUUID()}`,
        organizationId,
        householdId,
        plan: "essential",
      });
      expect(created.id).toMatch(/^cs_test_[A-Za-z0-9]+$/u);
      expect(new URL(created.url).hostname).toBe("checkout.stripe.com");
      sessionId = created.id;

      const retrieved = await stripeRequest(
        secretKey,
        `v1/checkout/sessions/${sessionId}?expand%5B%5D=line_items`,
        "GET",
      );
      expect(retrieved).toMatchObject({
        id: sessionId,
        mode: "subscription",
        status: "open",
        payment_status: "unpaid",
        client_reference_id: clientReferenceId,
        metadata: {
          legacy_organization_id: organizationId,
          legacy_household_id: householdId,
          legacy_plan: "essential",
        },
      });
      expect(retrieved.line_items?.data?.[0]?.price?.id).toBe(priceId);

      const closed = await stripeRequest(
        secretKey,
        `v1/checkout/sessions/${sessionId}/expire`,
        "POST",
      );
      expect(closed.status).toBe("expired");
      expired = true;
    } finally {
      if (sessionId && !expired)
        await stripeRequest(
          secretKey,
          `v1/checkout/sessions/${sessionId}/expire`,
          "POST",
        ).catch(() => undefined);
    }
  }, 60_000);

  it("creates a portal session for a disposable synthetic customer", async () => {
    const secretKey = local.STRIPE_SECRET_KEY ?? "";
    if (!/^sk_test_[A-Za-z0-9]+$/u.test(secretKey))
      throw new Error("Stripe live-fire requires a test-mode secret key");

    const adapter = new StripeAdapter({ secretKey, timeoutMs: 20_000 });
    let customerId: string | undefined;
    try {
      const customer = await stripeRequest(
        secretKey,
        "v1/customers",
        "POST",
        new URLSearchParams({
          description: "LegacyVault synthetic live-fire customer",
          "metadata[legacy_test_only]": "true",
        }),
      );
      expect(customer.id).toMatch(/^cus_[A-Za-z0-9]+$/u);
      if (!customer.id) throw new Error("Stripe customer response invalid");
      customerId = customer.id;

      const portal = await adapter.createBillingPortal({
        customerId,
        returnUrl: "https://app.example.invalid/billing",
        idempotencyKey: `stripe-portal-live-fire-${randomUUID()}`,
      });
      expect(portal.id).toMatch(/^bps_[A-Za-z0-9]+$/u);
      expect(new URL(portal.url).hostname).toBe("billing.stripe.com");
    } finally {
      if (customerId) {
        const deleted = await stripeRequest(
          secretKey,
          `v1/customers/${customerId}`,
          "DELETE",
        );
        expect(deleted).toMatchObject({ id: customerId, deleted: true });
      }
    }
  }, 60_000);
});
