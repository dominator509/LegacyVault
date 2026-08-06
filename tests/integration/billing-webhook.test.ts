import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StripeAdapter } from "../../apps/api/src/adapters/stripe.js";
import { buildServer } from "../../apps/api/src/server.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { VaultRepository } from "../../packages/database/src/repository.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const databaseUrl = readLocalEnvironment().TEST_DATABASE_URL ?? "";
const organizationId = randomUUID();
const householdId = randomUUID();
const actorId = randomUUID();
const subscriptionId = `sub_${randomUUID()}`;
const customerId = `cus_${randomUUID()}`;
const secret = "whsec_local_contract_secret";
const repository = new VaultRepository(databaseUrl);
const stripe = new StripeAdapter({ webhookSecret: secret, timeoutMs: 2_000 });
const server = buildServer({
  repository,
  stripe,
  resolveIdentity: async () => ({
    organizationId,
    householdId,
    actorId,
    membershipId: randomUUID(),
    role: "Owner",
    grants: [],
    supportApprovals: [],
    emergencyReleaseCategories: [],
    sessionIssuedAt: new Date().toISOString(),
    mfaVerifiedAt: new Date().toISOString(),
  }),
});

beforeAll(async () => {
  await runMigrations(databaseUrl);
  const client = createDatabaseClient(databaseUrl);
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.organization_id', $1, true)", [
      organizationId,
    ]);
    await client.query("insert into organizations(id,name) values ($1,$2)", [
      organizationId,
      "Billing Test Organization",
    ]);
    await client.query("select set_config('app.household_id', $1, true)", [
      householdId,
    ]);
    await client.query(
      "insert into households(id,organization_id,name) values ($1,$2,$3)",
      [householdId, organizationId, "Billing Test Household"],
    );
    await client.query("commit");
  } finally {
    await client.end();
  }
  await server.ready();
});

afterAll(async () => {
  await server.close();
  await repository.close();
});

function signedEvent(input: { id: string; created: number; status: string }) {
  const payload = JSON.stringify({
    id: input.id,
    type: "customer.subscription.updated",
    created: input.created,
    data: {
      object: {
        id: subscriptionId,
        customer: customerId,
        status: input.status,
        trial_end: null,
        current_period_end: 2_000_003_600,
        cancel_at_period_end: true,
        canceled_at: null,
        metadata: {
          legacy_organization_id: organizationId,
          legacy_household_id: householdId,
          legacy_plan: "essential",
        },
      },
    },
  });
  const timestamp = Math.floor(Date.now() / 1_000);
  const signature = createHmac("sha256", secret)
    .update(String(timestamp))
    .update(".")
    .update(payload)
    .digest("hex");
  return { payload, header: `t=${timestamp},v1=${signature}` };
}

function signedRefundEvent(input: {
  id: string;
  created: number;
  refundId: string;
  status: string;
}) {
  const payload = JSON.stringify({
    id: input.id,
    type: input.status === "failed" ? "refund.failed" : "refund.updated",
    created: input.created,
    data: {
      object: {
        id: input.refundId,
        charge: "ch_local_contract",
        amount: 2500,
        currency: "usd",
        reason: "requested_by_customer",
        status: input.status,
        metadata: {
          legacy_organization_id: organizationId,
          legacy_household_id: householdId,
        },
      },
    },
  });
  const timestamp = Math.floor(Date.now() / 1_000);
  const signature = createHmac("sha256", secret)
    .update(String(timestamp))
    .update(".")
    .update(payload)
    .digest("hex");
  return { payload, header: `t=${timestamp},v1=${signature}` };
}

describe("signed Stripe webhook persistence", () => {
  it("applies once and ignores both replay and an older event", async () => {
    await expect(
      repository.getSubscription({ organizationId, householdId, actorId }),
    ).resolves.toEqual({
      status: "inactive",
      plan: null,
      providerUpdatedAt: null,
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      version: 0,
      access: "read-only",
      graceUntil: null,
      entitlements: {
        vaultRead: true,
        vaultWrite: false,
        documentUpload: false,
        aiInterview: false,
        reportGeneration: false,
        exportGeneration: false,
      },
      quotas: {
        households: 1,
        members: null,
        storageBytes: null,
        aiInterviewsMonthly: null,
      },
    });
    const newest = signedEvent({
      id: `evt_${randomUUID()}`,
      created: 2_000_000_000,
      status: "active",
    });
    const applied = await server.inject({
      method: "POST",
      url: "/v1/billing/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": newest.header,
      },
      payload: newest.payload,
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json()).toEqual({ received: true, outcome: "applied" });
    const replay = await server.inject({
      method: "POST",
      url: "/v1/billing/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": newest.header,
      },
      payload: newest.payload,
    });
    expect(replay.json()).toEqual({ received: true, outcome: "duplicate" });
    const older = signedEvent({
      id: `evt_${randomUUID()}`,
      created: 1_999_999_999,
      status: "past_due",
    });
    const stale = await server.inject({
      method: "POST",
      url: "/v1/billing/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": older.header,
      },
      payload: older.payload,
    });
    expect(stale.json()).toEqual({ received: true, outcome: "stale" });
    await expect(
      repository.getSubscription({ organizationId, householdId, actorId }),
    ).resolves.toEqual({
      status: "active",
      plan: "essential",
      providerUpdatedAt: new Date(2_000_000_000 * 1_000).toISOString(),
      trialEndsAt: null,
      currentPeriodEndsAt: new Date(2_000_003_600 * 1_000).toISOString(),
      cancelAtPeriodEnd: true,
      canceledAt: null,
      version: 1,
      access: "full",
      graceUntil: null,
      entitlements: {
        vaultRead: true,
        vaultWrite: true,
        documentUpload: true,
        aiInterview: true,
        reportGeneration: true,
        exportGeneration: true,
      },
      quotas: {
        households: 1,
        members: null,
        storageBytes: null,
        aiInterviewsMonthly: null,
      },
    });
    await expect(
      repository.getBillingProviderCustomerId({
        organizationId,
        householdId,
        actorId,
      }),
    ).resolves.toBe(customerId);
  });

  it("rejects a bad signature without persisting the event", async () => {
    const event = signedEvent({
      id: `evt_${randomUUID()}`,
      created: 2_000_000_001,
      status: "active",
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/billing/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=00",
      },
      payload: event.payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      title: "Invalid webhook",
      status: 400,
    });
  });

  it("persists ordered signed refund lifecycle state without exposing provider identifiers", async () => {
    const refundId = `re_${randomUUID().replaceAll("-", "")}`;
    const refund = signedRefundEvent({
      id: `evt_${randomUUID()}`,
      created: 2_000_000_100,
      refundId,
      status: "succeeded",
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/billing/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": refund.header,
      },
      payload: refund.payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true, outcome: "applied" });
    await expect(
      repository.listBillingRefunds({ organizationId, householdId, actorId }),
    ).resolves.toEqual([
      expect.objectContaining({
        amount: 2500,
        currency: "usd",
        reason: "requested_by_customer",
        status: "succeeded",
        providerUpdatedAt: new Date(2_000_000_100 * 1_000).toISOString(),
        version: 1,
      }),
    ]);
    expect(
      JSON.stringify(
        await repository.listBillingRefunds({
          organizationId,
          householdId,
          actorId,
        }),
      ),
    ).not.toContain(refundId);
  });
});
