import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { StripeAdapter } from "../../apps/api/src/adapters/stripe.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () =>
  Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  ),
);

describe("Stripe checkout HTTP contract", () => {
  it("sends authenticated idempotent checkout with signed-event tenant metadata", async () => {
    let authorization = "";
    let idempotency = "";
    let received = new URLSearchParams();
    const server = createServer((request, response) => {
      authorization = request.headers.authorization ?? "";
      idempotency = String(request.headers["idempotency-key"] ?? "");
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: "cs_contract",
            url: "https://checkout.stripe.test/session",
          }),
        );
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    const adapter = new StripeAdapter({
      secretKey: "sk_test_contract",
      webhookSecret: "whsec_contract",
      essentialPriceId: "price_contract",
      baseUrl: `http://127.0.0.1:${address.port}/`,
      timeoutMs: 2_000,
    });
    await expect(
      adapter.createCheckout({
        clientReferenceId: "membership-contract",
        successUrl: "https://app.example.test/billing/success",
        cancelUrl: "https://app.example.test/billing/cancel",
        idempotencyKey: "checkout-contract-key",
        organizationId: "11111111-1111-4111-8111-111111111111",
        householdId: "22222222-2222-4222-8222-222222222222",
        plan: "essential",
      }),
    ).resolves.toEqual({
      id: "cs_contract",
      url: "https://checkout.stripe.test/session",
    });
    expect(authorization).toBe("Bearer sk_test_contract");
    expect(idempotency).toBe("checkout-contract-key");
    expect(Object.fromEntries(received)).toMatchObject({
      client_reference_id: "membership-contract",
      mode: "subscription",
      "line_items[0][price]": "price_contract",
      "subscription_data[metadata][legacy_organization_id]":
        "11111111-1111-4111-8111-111111111111",
      "subscription_data[metadata][legacy_household_id]":
        "22222222-2222-4222-8222-222222222222",
      "subscription_data[metadata][legacy_plan]": "essential",
      "metadata[legacy_organization_id]":
        "11111111-1111-4111-8111-111111111111",
    });
  });
});
