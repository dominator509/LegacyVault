import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StripeAdapter } from "../../apps/api/src/adapters/stripe.js";

describe("Stripe webhook verification", () => {
  it("accepts a current valid signature and rejects replay outside tolerance", () => {
    const secret = "whsec_test_only_not_external";
    const payload = Buffer.from(
      JSON.stringify({
        id: "evt_1",
        type: "customer.subscription.updated",
        created: 1000,
        data: { object: { id: "sub_1" } },
      }),
    );
    const signature = createHmac("sha256", secret)
      .update("1000.")
      .update(payload)
      .digest("hex");
    const adapter = new StripeAdapter({
      webhookSecret: secret,
      timeoutMs: 1000,
    });
    expect(
      adapter.verifyWebhook(
        payload,
        `t=1000,v1=${"0".repeat(64)},v1=${signature}`,
        1000,
      ).id,
    ).toBe("evt_1");
    expect(() =>
      adapter.verifyWebhook(payload, `t=1000,v1=${signature}`, 1400),
    ).toThrow(/timestamp/u);
    expect(() =>
      adapter.verifyWebhook(payload, "t=1000,v1=not-hex", 1000),
    ).toThrow(/timestamp/u);
  });
});
