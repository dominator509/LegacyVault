import { describe, expect, it } from "vitest";
import { authorize } from "../../packages/auth/src/index.js";
import type { PermissionGrant } from "../../packages/domain/src/index.js";

const now = "2026-08-05T12:00:00.000Z";
const grant: PermissionGrant = {
  id: "grant-1",
  organizationId: "org-1",
  householdId: "house-1",
  membershipId: "member-1",
  categories: ["insurance"],
  actions: ["read"],
  purpose: "customer support",
  startsAt: "2026-08-05T11:00:00.000Z",
  expiresAt: "2026-08-05T13:00:00.000Z",
  version: 1,
};

describe("service authorization policy", () => {
  it("requires recent MFA for owners", () => {
    expect(
      authorize({
        role: "Owner",
        grants: [],
        category: "insurance",
        action: "read",
        purpose: "vault review",
        now,
        sessionIssuedAt: "2026-08-05T11:00:00.000Z",
      }),
    ).toEqual({ allowed: false, reason: "mfa-required" });
  });
  it("rejects future session or MFA timestamps", () => {
    expect(
      authorize({
        role: "Owner",
        grants: [],
        category: "insurance",
        action: "read",
        purpose: "vault review",
        now,
        sessionIssuedAt: "2026-08-05T12:00:01.000Z",
        mfaVerifiedAt: now,
      }),
    ).toEqual({ allowed: false, reason: "session-expired" });
    expect(
      authorize({
        role: "Owner",
        grants: [],
        category: "insurance",
        action: "read",
        purpose: "vault review",
        now,
        sessionIssuedAt: now,
        mfaVerifiedAt: "2026-08-05T12:00:01.000Z",
      }),
    ).toEqual({ allowed: false, reason: "mfa-required" });
  });
  it("requires bounded owner-approved category access for support", () => {
    const base = {
      role: "SupportAgent" as const,
      grants: [grant],
      category: "insurance" as const,
      action: "read" as const,
      purpose: "customer support",
      now,
      sessionIssuedAt: "2026-08-05T11:50:00.000Z",
      mfaVerifiedAt: "2026-08-05T11:55:00.000Z",
    };
    expect(authorize(base)).toEqual({
      allowed: false,
      reason: "support-approval-required",
    });
    expect(
      authorize({
        ...base,
        supportApproval: {
          approvedByOwnerId: "owner-1",
          reasonCode: "ticket-verified",
          categories: ["insurance"],
          startsAt: "2026-08-05T11:30:00.000Z",
          expiresAt: "2026-08-05T12:30:00.000Z",
        },
      }),
    ).toEqual({ allowed: true, reason: "allow" });
    expect(
      authorize({
        ...base,
        purpose: "unrelated purpose",
        supportApproval: {
          approvedByOwnerId: "owner-1",
          reasonCode: "ticket-verified",
          categories: ["insurance"],
          startsAt: "2026-08-05T11:30:00.000Z",
          expiresAt: "2026-08-05T12:30:00.000Z",
        },
      }),
    ).toEqual({ allowed: false, reason: "permission-denied" });
  });
  it("never grants standing vault access to platform administrators or emergency recipients", () => {
    expect(
      authorize({
        role: "PlatformAdmin",
        grants: [],
        category: "insurance",
        action: "read",
        purpose: "maintenance",
        now,
        sessionIssuedAt: "2026-08-05T11:55:00.000Z",
        mfaVerifiedAt: "2026-08-05T11:55:00.000Z",
      }),
    ).toEqual({ allowed: false, reason: "permission-denied" });
    expect(
      authorize({
        role: "EmergencyRecipient",
        grants: [grant],
        category: "insurance",
        action: "read",
        purpose: "released emergency packet",
        now,
        sessionIssuedAt: "2026-08-05T11:00:00.000Z",
      }),
    ).toEqual({ allowed: false, reason: "emergency-release-required" });
  });
});
