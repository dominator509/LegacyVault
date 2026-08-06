import type { FastifyInstance } from "fastify";
import type { VaultRepository } from "@legacy/database/repository";
import type { StripeAdapter } from "../adapters/stripe.js";
import { standardProblemResponses } from "../openapi.js";

export async function registerBillingRoutes(
  server: FastifyInstance,
  dependencies: { repository: VaultRepository; stripe: StripeAdapter },
): Promise<void> {
  server.setErrorHandler((error, request, reply) => {
    const errorStatus =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;
    const status =
      errorStatus !== undefined && errorStatus >= 400 && errorStatus < 500
        ? errorStatus
        : 500;
    return reply
      .code(status)
      .type("application/problem+json")
      .send(
        problem(
          request.id,
          status,
          status === 400 ? "Invalid webhook" : "Webhook processing unavailable",
        ),
      );
  });

  server.removeContentTypeParser("application/json");
  server.addContentTypeParser(
    "application/json",
    { parseAs: "buffer", bodyLimit: 1_048_576 },
    (_request, body, done) => done(null, body),
  );
  server.post(
    "/v1/billing/webhooks/stripe",
    {
      schema: {
        tags: ["billing"],
        summary: "Process an authenticated Stripe subscription event",
        headers: {
          type: "object",
          additionalProperties: true,
          required: ["stripe-signature"],
          properties: {
            "stripe-signature": { type: "string", minLength: 1 },
          },
        },
        response: {
          200: {
            description: "Event persisted, ignored, or applied",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["received"],
                  properties: {
                    received: { type: "boolean", const: true },
                    ignored: { type: "boolean" },
                    outcome: {
                      type: "string",
                      enum: ["applied", "duplicate", "stale"],
                    },
                  },
                },
              },
            },
          },
          ...standardProblemResponses,
        },
      },
    },
    async (request, reply) => {
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
    },
  );
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
