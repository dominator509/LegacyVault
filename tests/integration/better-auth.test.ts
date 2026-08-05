import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLegacyAuth } from "../../packages/auth/src/index.js";
import { buildServer } from "../../apps/api/src/server.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { VaultRepository } from "../../packages/database/src/repository.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const environment = readLocalEnvironment();
const databaseUrl = environment.TEST_DATABASE_URL ?? "";
const verificationLinks: string[] = [];
const runtime = createLegacyAuth({
  databaseUrl,
  secret: environment.SESSION_SECRET ?? "",
  baseUrl: "http://127.0.0.1:3001",
  trustedOrigins: ["http://127.0.0.1:3000"],
  relyingPartyId: "127.0.0.1",
  production: false,
  sendVerificationEmail: async ({ url }) => void verificationLinks.push(url),
  sendPasswordResetEmail: async () => undefined,
});
const repository = new VaultRepository(databaseUrl);
const server = buildServer({
  repository,
  resolveIdentity: async () => {
    throw new Error("identity resolution is not used by auth endpoints");
  },
  auth: runtime.auth,
  authBaseUrl: "http://127.0.0.1:3001",
});

beforeAll(async () => {
  await runMigrations(databaseUrl);
  await server.ready();
});
afterAll(async () => {
  await server.close();
  await repository.close();
  await runtime.close();
});

describe("real Better Auth PostgreSQL integration", () => {
  it("creates an unverified account with Argon2id credentials and no session", async () => {
    const email = `auth-${randomUUID()}@example.test`;
    const result = await runtime.auth.api.signUpEmail({
      body: {
        name: "Auth Integration User",
        email,
        password: "correct horse battery staple 2026",
      },
    });
    expect(result.user).toMatchObject({ email, emailVerified: false });
    expect(result.token).toBeNull();
    expect(verificationLinks).toHaveLength(1);
    expect(new URL(verificationLinks[0] ?? "").pathname).toContain(
      "verify-email",
    );

    const client = createDatabaseClient(databaseUrl);
    await client.connect();
    try {
      const stored = await client.query<{ password: string | null }>(
        'select a.password from "account" a join "user" u on u.id=a."userId" where u.email=$1 and a."providerId"=$2',
        [email, "credential"],
      );
      expect(stored.rows[0]?.password).toMatch(/^\$argon2id\$/u);
      expect(stored.rows[0]?.password).not.toContain("correct horse");
      const sessions = await client.query<{ count: number }>(
        'select count(*)::int as count from "session" s join "user" u on u.id=s."userId" where u.email=$1',
        [email],
      );
      expect(sessions.rows[0]?.count).toBe(0);
    } finally {
      await client.end();
    }
  }, 20_000);

  it("serves Better Auth through the Fastify bridge", async () => {
    const ok = await server.inject({ method: "GET", url: "/api/auth/ok" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true });

    const email = `bridge-${randomUUID()}@example.test`;
    const signup = await server.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin: "http://127.0.0.1:3000" },
      payload: {
        name: "Bridge Integration User",
        email,
        password: "bridge password has sufficient length 2026",
      },
    });
    expect(signup.statusCode).toBe(200);
    expect(signup.json()).toMatchObject({
      token: null,
      user: { email, emailVerified: false },
    });
  }, 20_000);
});
