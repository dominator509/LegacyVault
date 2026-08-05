export const retentionCategories = [
  "confirmed-facts",
  "original-documents",
  "ocr-temporary-files",
  "candidate-facts",
  "ai-request-metadata",
  "audit-events",
  "consent-acceptance",
  "billing-records",
  "security-logs",
  "backups",
  "privacy-request-evidence",
] as const;
export type RetentionCategory = (typeof retentionCategories)[number];
export interface RetentionRule {
  category: RetentionCategory;
  activeDays: number | "account-lifetime" | "counsel-defined";
  postAccountDays: number | "counsel-defined";
  legalHoldEligible: boolean;
}
export function isEligibleForDeletion(
  rule: RetentionRule,
  ageDays: number,
  accountClosed: boolean,
  legalHold: boolean,
): boolean {
  if (legalHold && rule.legalHoldEligible) return false;
  const threshold = accountClosed ? rule.postAccountDays : rule.activeDays;
  return typeof threshold === "number" && ageDays >= threshold;
}
