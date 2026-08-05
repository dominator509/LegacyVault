import type { FastifyInstance } from "fastify";
import type { VaultRepository } from "@legacy/database/repository";
import type { StripeAdapter } from "../adapters/stripe.js";

export async function registerBillingRoutes(
  server: FastifyInstance,
  dependencies: { repository: VaultRepository; stripe: StripeAdapter },
): Promise<void> {
  server.removeContentTypeParser("application/json");
  server.addContentTypeParser(
    "application/json",
    { parseAs: "buffer", bodyLimit: 1_048_576 },
    (_request, body, done) => done(null, body),
  );
  server.post("/v1/billing/webhooks/stripe", async (request, reply) => {
    const signature = request.headers["stripe-signature"];
    if (typeof signature !== "string" || !Buffer.isBuffer(request.body))
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem(request.id, 400, "Invalid webhook"));
    let event;
    try {
      const verified = dependencies.stripe.verifyWebhook(
        request.body,
        signature,
      );
      event = dependencies.stripe.normalizeSubscriptionEvent(verified);
      if (!event) return reply.send({ received: true, ignored: true });
    } catch {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem(request.id, 400, "Invalid webhook"));
    }
    try {
      const result = await dependencies.repository.processBillingEvent(
        {
          organizationId: event.organizationId,
          householdId: event.householdId,
          actorId: event.organizationId,
        },
        event,
      );
      return reply.send({ received: true, outcome: result.outcome });
    } catch {
      return reply
        .code(503)
        .type("application/problem+json")
        .send(problem(request.id, 503, "Webhook processing unavailable"));
    }
  });
}

function problem(instance: string, status: number, title: string) {
  return {
    type: "about:blank",
    title,
    status,
    detail: "The webhook could not be processed.",
    instance,
    traceId: instance,
  };
}
