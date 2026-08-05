import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthorizationDeniedError,
  MembershipIdentityStore,
  PostgresAccessApprovalStore,
  requireIdentityAuthorization,
} from "../../packages/auth/src/index.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const databaseUrl = readLocalEnvironment().TEST_DATABASE_URL ?? "";
const organizationId = randomUUID();
const householdId = randomUUID();
const ownerPersonId = randomUUID();
const supportPersonId = randomUUID();
const emergencyPersonId = randomUUID();
const supportMembershipId = randomUUID();
const emergencyMembershipId = randomUUID();
const supportUserId = randomUUID();
const emergencyUserId = randomUUID();
const store = new MembershipIdentityStore(databaseUrl);
const approvalStore = new PostgresAccessApprovalStore(
  databaseUrl,
  (identity, scope) => requireIdentityAuthorization(identity, scope),
);
let supportApprovalId = "";

function ownerIdentity() {
  const now = new Date().toISOString();
  return {
    organizationId,
    householdId,
    actorId: ownerPersonId,
    membershipId: randomUUID(),
    role: "Owner" as const,
    grants: [],
    supportApprovals: [],
    emergencyReleaseCategories: [],
    sessionIssuedAt: now,
    mfaVerifiedAt: now,
  };
}

beforeAll(async () => {
  await runMigrations(databaseUrl);
  const client = createDatabaseClient(databaseUrl);
  await client.connect();
  try {
    await client.query("begin");
    for (const [id, name] of [
      [supportUserId, "Support User"],
      [emergencyUserId, "Emergency User"],
    ])
      await client.query(
        'insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values ($1,$2,$3,true,now(),now())',
        [id, name, `${id}@example.test`],
      );
    await client.query("select set_config('app.organization_id',$1,true)", [
      organizationId,
    ]);
    await client.query("insert into organizations(id,name) values ($1,$2)", [
      organizationId,
      "Bounded Access Organization",
    ]);
    await client.query("select set_config('app.household_id',$1,true)", [
      householdId,
    ]);
    await client.query(
      "insert into households(id,organization_id,name) values ($1,$2,$3)",
      [householdId, organizationId, "Bounded Access Household"],
    );
    for (const [id, label] of [
      [ownerPersonId, "owner"],
      [supportPersonId, "support"],
      [emergencyPersonId, "emergency"],
    ] as const)
      await client.query(
        "insert into people(id,organization_id,household_id,display_name_encrypted,key_version) values ($1,$2,$3,$4,1)",
        [id, organizationId, householdId, Buffer.from(label)],
      );
    await client.query(
      "insert into memberships(id,organization_id,household_id,person_id,role,auth_user_id) values ($1,$2,$3,$4,'SupportAgent',$5),($6,$2,$3,$7,'EmergencyRecipient',$8)",
      [
        supportMembershipId,
        organizationId,
        householdId,
        supportPersonId,
        supportUserId,
        emergencyMembershipId,
        emergencyPersonId,
        emergencyUserId,
      ],
    );
    for (const membershipId of [supportMembershipId, emergencyMembershipId])
      await client.query(
        "insert into permission_grants(id,organization_id,household_id,membership_id,categories,actions,purpose,starts_at,expires_at) values ($1,$2,$3,$4,$5,$6,$7,now()-interval '5 minutes',now()+interval '1 hour')",
        [
          randomUUID(),
          organizationId,
          householdId,
          membershipId,
          JSON.stringify(["insurance"]),
          JSON.stringify(["read"]),
          "released packet",
        ],
      );
    await client.query(
      "insert into emergency_access_requests(id,organization_id,household_id,requester_id,recipient_membership_id,categories,reason_encrypted,key_version,status,requested_at,decision_at,release_after) values ($1,$2,$3,$4,$5,$6,$7,1,'released',now()-interval '2 hours',now()-interval '1 hour',now()-interval '5 minutes')",
      [
        randomUUID(),
        organizationId,
        householdId,
        ownerPersonId,
        emergencyMembershipId,
        JSON.stringify(["insurance"]),
        Buffer.from("encrypted reason"),
      ],
    );
    await client.query("commit");
  } finally {
    await client.end();
  }
  const now = Date.now();
  const approval = await approvalStore.approveSupportAccess(ownerIdentity(), {
    supportMembershipId,
    reasonCode: "verified-support-case",
    categories: ["insurance"],
    startsAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 60 * 60 * 1_000).toISOString(),
  });
  supportApprovalId = approval.id;
});

afterAll(async () => {
  await store.close();
  await approvalStore.close();
});

function sessionContext<T extends Awaited<ReturnType<typeof store.resolve>>>(
  identity: T,
) {
  const now = new Date().toISOString();
  return { ...identity, sessionIssuedAt: now, mfaVerifiedAt: now };
}

describe("persisted bounded-access authorization", () => {
  it("allows support only within an active owner-approved category", async () => {
    const identity = sessionContext(
      await store.resolve(supportUserId, householdId),
    );
    expect(() =>
      requireIdentityAuthorization(identity, {
        category: "insurance",
        action: "read",
        purpose: "released packet",
      }),
    ).not.toThrow();
    expect(() =>
      requireIdentityAuthorization(identity, {
        category: "assets",
        action: "read",
        purpose: "released packet",
      }),
    ).toThrow(AuthorizationDeniedError);
    await expect(
      approvalStore.revokeSupportAccess(ownerIdentity(), supportApprovalId, 1),
    ).resolves.toMatchObject({ id: supportApprovalId, version: 2 });
    const revokedIdentity = sessionContext(
      await store.resolve(supportUserId, householdId),
    );
    expect(() =>
      requireIdentityAuthorization(revokedIdentity, {
        category: "insurance",
        action: "read",
        purpose: "released packet",
      }),
    ).toThrow(AuthorizationDeniedError);
  });

  it("allows an emergency recipient only for a persisted released category", async () => {
    const identity = sessionContext(
      await store.resolve(emergencyUserId, householdId),
    );
    expect(() =>
      requireIdentityAuthorization(identity, {
        category: "insurance",
        action: "read",
        purpose: "released packet",
      }),
    ).not.toThrow();
    expect(() =>
      requireIdentityAuthorization(identity, {
        category: "assets",
        action: "read",
        purpose: "released packet",
      }),
    ).toThrow(AuthorizationDeniedError);
  });
});
