import type {
  IsoDateTime,
  PermissionAction,
  PermissionGrant,
  RecordCategory,
  Role,
} from "./entities.js";

const roleActions: Readonly<Record<Role, readonly PermissionAction[]>> = {
  Owner: ["read", "create", "update", "delete", "export", "approve"],
  CoOwner: ["read", "create", "update", "delete", "export", "approve"],
  Editor: ["read", "create", "update"],
  FamilyHelper: ["read", "create", "update"],
  ProfessionalAdvisor: ["read", "create", "update"],
  ReadOnlyViewer: ["read"],
  EmergencyRecipient: ["read"],
  SupportAgent: ["read"],
  PlatformAdmin: [],
};

export function isGrantActive(
  grant: PermissionGrant,
  at: IsoDateTime,
): boolean {
  const timestamp = Date.parse(at);
  return (
    !grant.revokedAt &&
    Date.parse(grant.startsAt) <= timestamp &&
    (!grant.expiresAt || Date.parse(grant.expiresAt) > timestamp)
  );
}

export function permits(
  role: Role,
  grants: readonly PermissionGrant[],
  category: RecordCategory,
  action: PermissionAction,
  at: IsoDateTime,
): boolean {
  if (!roleActions[role].includes(action)) return false;
  if (role === "Owner" || role === "CoOwner") return true;
  return grants.some(
    (grant) =>
      isGrantActive(grant, at) &&
      grant.categories.includes(category) &&
      grant.actions.includes(action),
  );
}
