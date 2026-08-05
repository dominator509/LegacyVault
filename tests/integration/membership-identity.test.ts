import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AuthenticationRequiredError,
  MembershipIdentityStore,
} from "../../packages/auth/src/index.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const databaseUrl = readLocalEnvironment().TEST_DATABASE_URL ?? "";
const organizationId = randomUUID();
const householdId = randomUUID();
const personId = randomUUID();
const membershipId = randomUUID();
const authUserId = randomUUID();
const store = new MembershipIdentityStore(databaseUrl);

beforeAll(async () => {
  await runMigrations(databaseUrl);
  const client = createDatabaseClient(databaseUrl);
  await client.connect();
  try {
    await client.query("begin");
    await client.query(
      'insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values ($1,$2,$3,true,now(),now())',
      [authUserId, "Identity Test User", `${authUserId}@example.test`],
    );
    await client.query("select set_config('app.organization_id',$1,true)", [
      organizationId,
    ]);
    await client.query("insert into organizations(id,name) values ($1,$2)", [
      organizationId,
      "Identity Test Organization",
    ]);
    await client.query("select set_config('app.household_id',$1,true)", [
      householdId,
    ]);
    await client.query(
      "insert into households(id,organization_id,name) values ($1,$2,$3)",
      [householdId, organizationId, "Identity Test Household"],
    );
    await client.query(
      "insert into people(id,organization_id,household_id,display_name_encrypted,key_version) values ($1,$2,$3,$4,1)",
      [personId, organizationId, householdId, Buffer.from("encrypted")],
    );
    await client.query(
      "insert into memberships(id,organization_id,household_id,person_id,role,auth_user_id) values ($1,$2,$3,$4,'Owner',$5)",
      [membershipId, organizationId, householdId, personId, authUserId],
    );
    await client.query(
      "insert into permission_grants(id,organization_id,household_id,membership_id,categories,actions,purpose,starts_at,expires_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        randomUUID(),
        organizationId,
        householdId,
        membershipId,
        JSON.stringify(["insurance"]),
        JSON.stringify(["read"]),
        "annual review",
        "2026-08-05T10:00:00.000Z",
        "2026-08-05T14:00:00.000Z",
      ],
    );
    await client.query("commit");
  } finally {
    await client.end();
  }
});

afterAll(async () => store.close());

describe("session user to tenant identity resolution", () => {
  it("allows only a selected household membership belonging to the authenticated user", async () => {
    await expect(store.resolve(authUserId, householdId)).resolves.toMatchObject(
      {
        organizationId,
        householdId,
        actorId: personId,
        membershipId,
        role: "Owner",
        grants: [
          {
            organizationId,
            householdId,
            membershipId,
            categories: ["insurance"],
            actions: ["read"],
            purpose: "annual review",
          },
        ],
      },
    );
    await expect(
      store.resolve(randomUUID(), householdId),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    await expect(
      store.resolve(authUserId, randomUUID()),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  it("binds session age and MFA evidence to the resolved membership", async () => {
    await expect(
      import("../../packages/auth/src/identity.js").then(
        ({ resolveRequestIdentity }) =>
          resolveRequestIdentity(
            {
              getSession: async () => ({
                user: { id: authUserId, twoFactorEnabled: true },
                session: { createdAt: "2026-08-05T12:00:00.000Z" },
              }),
            },
            store,
            { "x-household-id": householdId },
          ),
      ),
    ).resolves.toMatchObject({
      membershipId,
      sessionIssuedAt: "2026-08-05T12:00:00.000Z",
      mfaVerifiedAt: "2026-08-05T12:00:00.000Z",
    });
  });
});
