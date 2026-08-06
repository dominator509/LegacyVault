import { describe, expect, it } from "vitest";
import {
  BILLING_TECHNICAL_GRACE_MS,
  deriveBillingAccess,
} from "../../packages/domain/src/index.js";

describe("billing entitlements", () => {
  it("enables Essential access only for authoritative active or trialing state", () => {
    for (const status of ["active", "trialing"] as const)
      expect(
        deriveBillingAccess({
          status,
          plan: "essential",
          providerUpdatedAt: "2026-08-06T00:00:00.000Z",
        }),
      ).toMatchObject({
        access: "full",
        graceUntil: null,
        entitlements: { vaultRead: true, vaultWrite: true, aiInterview: true },
        quotas: { households: 1 },
      });
  });

  it("provides bounded past-due continuity without spending on AI", () => {
    const updated = "2026-08-06T00:00:00.000Z";
    const withinGrace = new Date(
      Date.parse(updated) + BILLING_TECHNICAL_GRACE_MS - 1,
    ).toISOString();
    const expiredGrace = new Date(
      Date.parse(updated) + BILLING_TECHNICAL_GRACE_MS,
    ).toISOString();
    expect(
      deriveBillingAccess({
        status: "past_due",
        plan: "essential",
        providerUpdatedAt: updated,
        now: withinGrace,
      }),
    ).toMatchObject({
      access: "grace",
      entitlements: { vaultWrite: true, aiInterview: false },
    });
    expect(
      deriveBillingAccess({
        status: "past_due",
        plan: "essential",
        providerUpdatedAt: updated,
        now: expiredGrace,
      }),
    ).toMatchObject({
      access: "read-only",
      graceUntil: null,
      entitlements: { vaultRead: true, vaultWrite: false },
    });
  });

  it("fails closed for incomplete, inactive, canceled, unpaid, paused, or unknown plans", () => {
    for (const status of [
      "inactive",
      "incomplete",
      "incomplete_expired",
      "canceled",
      "unpaid",
      "paused",
    ] as const)
      expect(
        deriveBillingAccess({
          status,
          plan: status === "inactive" ? null : "essential",
          providerUpdatedAt: null,
        }).access,
      ).toBe("read-only");
    expect(
      deriveBillingAccess({
        status: "active",
        plan: "unknown",
        providerUpdatedAt: null,
      }).access,
    ).toBe("read-only");
  });
});
