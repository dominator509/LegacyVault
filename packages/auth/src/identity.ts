import pg from "pg";
import type { IncomingHttpHeaders } from "node:http";
import type {
  PermissionAction,
  PermissionGrant,
  RecordCategory,
  Role,
} from "@legacy/domain";
import { fromNodeHeaders } from "better-auth/node";
import type { SupportAccessApproval } from "./policy.js";
import { requireAuthorization } from "./policy.js";

export class AuthenticationRequiredError extends Error {
  override readonly name = "AuthenticationRequiredError";
}

export class HouseholdSelectionRequiredError extends Error {
  override readonly name = "HouseholdSelectionRequiredError";
}

export interface ResolvedMembershipIdentity {
  organizationId: string;
  householdId: string;
  actorId: string;
  membershipId: string;
  role: Role;
  grants: readonly PermissionGrant[];
  supportApprovals: readonly SupportAccessApproval[];
  emergencyReleaseCategories: readonly RecordCategory[];
}

export interface AuthenticatedTenantIdentity extends ResolvedMembershipIdentity {
  sessionIssuedAt: string;
  mfaVerifiedAt?: string;
}

export interface AuthenticatedAccountIdentity {
  authUserId: string;
  email: string;
  emailVerified: true;
}

const roles = new Set<Role>([
  "Owner",
  "CoOwner",
  "Editor",
  "FamilyHelper",
  "ProfessionalAdvisor",
  "ReadOnlyViewer",
  "EmergencyRecipient",
  "SupportAgent",
  "PlatformAdmin",
]);
const categories = new Set<RecordCategory>([
  "contacts",
  "advisers",
  "dependents",
  "pets",
  "assets",
  "liabilities",
  "insurance",
  "property",
  "estate-documents",
  "medical-summary",
  "digital-asset-locations",
  "household-instructions",
  "funeral-preferences",
]);
const actions = new Set<PermissionAction>([
  "read",
  "create",
  "update",
  "delete",
  "export",
  "approve",
]);

function enumArray<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  field: string,
): T[] {
  if (!Array.isArray(value) || !value.every((item) => allowed.has(item as T)))
    throw new AuthenticationRequiredError(`invalid ${field}`);
  return value as T[];
}

export class MembershipIdentityStore {
  readonly #pool: pg.Pool;
  constructor(databaseUrl: string) {
    this.#pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      application_name: "legacy-vault-identity",
    });
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async resolve(
    authUserId: string,
    requestedHouseholdId?: string,
  ): Promise<ResolvedMembershipIdentity> {
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.auth_user_id',$1,true)", [
        authUserId,
      ]);
      const result = await client.query<{
        id: string;
        organization_id: string;
        household_id: string;
        person_id: string;
        role: Role;
      }>(
        "select id,organization_id,household_id,person_id,role from memberships where active=1 and ($1::uuid is null or household_id=$1::uuid) order by id limit 2",
        [requestedHouseholdId ?? null],
      );
      if (result.rows.length === 0)
        throw new AuthenticationRequiredError("membership unavailable");
      if (!requestedHouseholdId && result.rows.length > 1)
        throw new HouseholdSelectionRequiredError(
          "household selection required",
        );
      const row = result.rows[0];
      if (!row) throw new AuthenticationRequiredError("membership unavailable");
      if (!roles.has(row.role))
        throw new AuthenticationRequiredError("membership role invalid");
      await client.query("select set_config('app.organization_id',$1,true)", [
        row.organization_id,
      ]);
      await client.query("select set_config('app.household_id',$1,true)", [
        row.household_id,
      ]);
      const grantRows = await client.query<{
        id: string;
        organization_id: string;
        household_id: string;
        membership_id: string;
        categories: unknown;
        actions: unknown;
        purpose: string;
        starts_at: Date;
        expires_at: Date | null;
        revoked_at: Date | null;
        version: number;
      }>(
        "select id,organization_id,household_id,membership_id,categories,actions,purpose,starts_at,expires_at,revoked_at,version from permission_grants where membership_id=$1 order by starts_at,id",
        [row.id],
      );
      const supportRows =
        row.role === "SupportAgent"
          ? await client.query<{
              approved_by_owner_id: string;
              reason_code: string;
              categories: unknown;
              starts_at: Date;
              expires_at: Date;
              revoked_at: Date | null;
            }>(
              "select approved_by_owner_id,reason_code,categories,starts_at,expires_at,revoked_at from support_access_approvals where support_membership_id=$1 and revoked_at is null and starts_at<=now() and expires_at>now() order by expires_at,id",
              [row.id],
            )
          : { rows: [] };
      const emergencyRows =
        row.role === "EmergencyRecipient"
          ? await client.query<{ categories: unknown }>(
              "select categories from emergency_access_requests where recipient_membership_id=$1 and status='released' and release_after is not null and release_after<=now() order by release_after,id",
              [row.id],
            )
          : { rows: [] };
      const identity = {
        organizationId: row.organization_id,
        householdId: row.household_id,
        actorId: row.person_id,
        membershipId: row.id,
        role: row.role,
        grants: grantRows.rows.map((grant) => ({
          id: grant.id,
          organizationId: grant.organization_id,
          householdId: grant.household_id,
          membershipId: grant.membership_id,
          categories: enumArray(
            grant.categories,
            categories,
            "grant categories",
          ),
          actions: enumArray(grant.actions, actions, "grant actions"),
          purpose: grant.purpose,
          startsAt: grant.starts_at.toISOString(),
          ...(grant.expires_at
            ? { expiresAt: grant.expires_at.toISOString() }
            : {}),
          ...(grant.revoked_at
            ? { revokedAt: grant.revoked_at.toISOString() }
            : {}),
          version: grant.version,
        })),
        supportApprovals: supportRows.rows.map((approval) => ({
          approvedByOwnerId: approval.approved_by_owner_id,
          reasonCode: approval.reason_code,
          categories: enumArray(
            approval.categories,
            categories,
            "support approval categories",
          ),
          startsAt: approval.starts_at.toISOString(),
          expiresAt: approval.expires_at.toISOString(),
          ...(approval.revoked_at
            ? { revokedAt: approval.revoked_at.toISOString() }
            : {}),
        })),
        emergencyReleaseCategories: [
          ...new Set(
            emergencyRows.rows.flatMap((release) =>
              enumArray(
                release.categories,
                categories,
                "emergency release categories",
              ),
            ),
          ),
        ],
      };
      await client.query("commit");
      return identity;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

export function requireIdentityAuthorization(
  identity: AuthenticatedTenantIdentity,
  request: {
    category: RecordCategory;
    action: PermissionAction;
    purpose: string;
    now?: string;
  },
): void {
  requireAuthorization({
    role: identity.role,
    grants: identity.grants,
    category: request.category,
    action: request.action,
    purpose: request.purpose,
    now: request.now ?? new Date().toISOString(),
    sessionIssuedAt: identity.sessionIssuedAt,
    ...(identity.mfaVerifiedAt
      ? { mfaVerifiedAt: identity.mfaVerifiedAt }
      : {}),
    supportApprovals: identity.supportApprovals,
    emergencyReleaseCategories: identity.emergencyReleaseCategories,
  });
}

export interface AuthSessionReader {
  getSession(input: { headers: Headers }): Promise<{
    user: {
      id: string;
      email?: string;
      emailVerified?: boolean;
      twoFactorEnabled?: boolean;
    };
    session: { createdAt: Date | string };
  } | null>;
}

export async function resolveRequestAccount(
  authApi: AuthSessionReader,
  headers: IncomingHttpHeaders,
): Promise<AuthenticatedAccountIdentity> {
  const session = await authApi.getSession({
    headers: fromNodeHeaders(headers),
  });
  if (!session)
    throw new AuthenticationRequiredError("authentication required");
  if (
    !session.user.emailVerified ||
    typeof session.user.email !== "string" ||
    session.user.email.length < 3
  )
    throw new AuthenticationRequiredError("verified email required");
  return {
    authUserId: session.user.id,
    email: session.user.email,
    emailVerified: true,
  };
}

export async function resolveRequestIdentity(
  authApi: AuthSessionReader,
  store: MembershipIdentityStore,
  headers: IncomingHttpHeaders,
): Promise<AuthenticatedTenantIdentity> {
  const session = await authApi.getSession({
    headers: fromNodeHeaders(headers),
  });
  if (!session)
    throw new AuthenticationRequiredError("authentication required");
  const selected = headers["x-household-id"];
  if (selected !== undefined && typeof selected !== "string")
    throw new HouseholdSelectionRequiredError("household selection invalid");
  if (
    selected &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      selected,
    )
  )
    throw new HouseholdSelectionRequiredError("household selection invalid");
  const membership = await store.resolve(session.user.id, selected);
  const sessionIssuedAt = new Date(session.session.createdAt).toISOString();
  return {
    ...membership,
    sessionIssuedAt,
    ...(session.user.twoFactorEnabled
      ? { mfaVerifiedAt: sessionIssuedAt }
      : {}),
  };
}
