import {
  permits,
  type PermissionAction,
  type PermissionGrant,
  type RecordCategory,
  type Role,
} from "@legacy/domain";

export interface SupportAccessApproval {
  approvedByOwnerId: string;
  reasonCode: string;
  categories: readonly RecordCategory[];
  startsAt: string;
  expiresAt: string;
  revokedAt?: string;
}
export interface AuthorizationRequest {
  role: Role;
  grants: readonly PermissionGrant[];
  category: RecordCategory;
  action: PermissionAction;
  purpose: string;
  now: string;
  sessionIssuedAt: string;
  mfaVerifiedAt?: string;
  supportApproval?: SupportAccessApproval;
  emergencyReleaseApproved?: boolean;
}
export interface AuthorizationDecision {
  allowed: boolean;
  reason:
    | "allow"
    | "invalid-purpose"
    | "session-expired"
    | "mfa-required"
    | "permission-denied"
    | "support-approval-required"
    | "emergency-release-required";
}

const mfaRoles: readonly Role[] = [
  "Owner",
  "CoOwner",
  "SupportAgent",
  "PlatformAdmin",
];
const staffRoles: readonly Role[] = ["SupportAgent", "PlatformAdmin"];

export function authorize(
  request: AuthorizationRequest,
): AuthorizationDecision {
  const now = Date.parse(request.now);
  if (!request.purpose.trim())
    return { allowed: false, reason: "invalid-purpose" };
  const maximumSessionAgeMs = staffRoles.includes(request.role)
    ? 15 * 60 * 1_000
    : 7 * 24 * 60 * 60 * 1_000;
  const sessionIssuedAt = Date.parse(request.sessionIssuedAt);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(sessionIssuedAt) ||
    sessionIssuedAt > now ||
    now - sessionIssuedAt > maximumSessionAgeMs
  )
    return { allowed: false, reason: "session-expired" };
  if (mfaRoles.includes(request.role)) {
    const mfaVerifiedAt = request.mfaVerifiedAt
      ? Date.parse(request.mfaVerifiedAt)
      : Number.NaN;
    if (
      !Number.isFinite(mfaVerifiedAt) ||
      mfaVerifiedAt > now ||
      now - mfaVerifiedAt > 12 * 60 * 60 * 1_000
    )
      return { allowed: false, reason: "mfa-required" };
  }
  if (request.role === "PlatformAdmin")
    return { allowed: false, reason: "permission-denied" };
  if (request.role === "SupportAgent") {
    const approval = request.supportApproval;
    if (
      !approval ||
      approval.revokedAt ||
      !approval.reasonCode.trim() ||
      !approval.categories.includes(request.category) ||
      Date.parse(approval.startsAt) > now ||
      Date.parse(approval.expiresAt) <= now ||
      Date.parse(approval.expiresAt) - Date.parse(approval.startsAt) >
        4 * 60 * 60 * 1_000
    )
      return { allowed: false, reason: "support-approval-required" };
  }
  if (
    request.role === "EmergencyRecipient" &&
    !request.emergencyReleaseApproved
  )
    return { allowed: false, reason: "emergency-release-required" };
  return permits(
    request.role,
    request.grants.filter((grant) => grant.purpose === request.purpose),
    request.category,
    request.action,
    request.now,
  )
    ? { allowed: true, reason: "allow" }
    : { allowed: false, reason: "permission-denied" };
}
