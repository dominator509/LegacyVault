export type SubscriptionStatus =
  | "inactive"
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export type BillingAccessMode = "full" | "grace" | "read-only";

export interface BillingEntitlements {
  vaultRead: true;
  vaultWrite: boolean;
  documentUpload: boolean;
  aiInterview: boolean;
  reportGeneration: boolean;
  exportGeneration: boolean;
}

export interface BillingQuotas {
  households: number;
  members: number | null;
  storageBytes: number | null;
  aiInterviewsMonthly: number | null;
}

export interface BillingAccessDecision {
  access: BillingAccessMode;
  graceUntil: string | null;
  entitlements: BillingEntitlements;
  quotas: BillingQuotas;
}

export const ESSENTIAL_QUOTAS: BillingQuotas = Object.freeze({
  households: 1,
  members: null,
  storageBytes: null,
  aiInterviewsMonthly: null,
});

export const BILLING_TECHNICAL_GRACE_MS = 72 * 60 * 60 * 1_000;

const fullEntitlements: BillingEntitlements = Object.freeze({
  vaultRead: true,
  vaultWrite: true,
  documentUpload: true,
  aiInterview: true,
  reportGeneration: true,
  exportGeneration: true,
});

const readOnlyEntitlements: BillingEntitlements = Object.freeze({
  vaultRead: true,
  vaultWrite: false,
  documentUpload: false,
  aiInterview: false,
  reportGeneration: false,
  exportGeneration: false,
});

const graceEntitlements: BillingEntitlements = Object.freeze({
  ...fullEntitlements,
  aiInterview: false,
});

export function deriveBillingAccess(input: {
  status: SubscriptionStatus;
  plan: string | null;
  providerUpdatedAt: string | null;
  now?: string;
}): BillingAccessDecision {
  if (
    input.plan === "essential" &&
    (input.status === "active" || input.status === "trialing")
  )
    return {
      access: "full",
      graceUntil: null,
      entitlements: fullEntitlements,
      quotas: ESSENTIAL_QUOTAS,
    };

  if (
    input.plan === "essential" &&
    input.status === "past_due" &&
    input.providerUpdatedAt
  ) {
    const graceUntil = new Date(
      Date.parse(input.providerUpdatedAt) + BILLING_TECHNICAL_GRACE_MS,
    );
    const now = Date.parse(input.now ?? new Date().toISOString());
    if (Number.isFinite(graceUntil.getTime()) && now < graceUntil.getTime())
      return {
        access: "grace",
        graceUntil: graceUntil.toISOString(),
        entitlements: graceEntitlements,
        quotas: ESSENTIAL_QUOTAS,
      };
  }

  return {
    access: "read-only",
    graceUntil: null,
    entitlements: readOnlyEntitlements,
    quotas: ESSENTIAL_QUOTAS,
  };
}
