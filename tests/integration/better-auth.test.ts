import { createHmac, randomUUID } from "node:crypto";
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
const passwordResetLinks: string[] = [];
const runtime = createLegacyAuth({
  databaseUrl,
  secret: environment.SESSION_SECRET ?? "",
  baseUrl: "http://127.0.0.1:3001",
  passkeyOrigin: "http://localhost:3000",
  trustedOrigins: ["http://127.0.0.1:3000"],
  relyingPartyId: "localhost",
  production: false,
  sendVerificationEmail: async ({ url }) => void verificationLinks.push(url),
  sendPasswordResetEmail: async ({ url }) => void passwordResetLinks.push(url),
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

  it("executes password recovery with a single-use token and session revocation", async () => {
    const email = `recovery-${randomUUID()}@example.test`;
    const oldPassword = "recovery old password has enough length 2026";
    const newPassword = "recovery new password has enough length 2026";
    await runtime.auth.api.signUpEmail({
      body: { name: "Recovery User", email, password: oldPassword },
    });
    const client = createDatabaseClient(databaseUrl);
    await client.connect();
    try {
      await client.query(
        'update "user" set "emailVerified"=true where email=$1',
        [email],
      );
    } finally {
      await client.end();
    }
    const before = passwordResetLinks.length;
    const requested = await server.inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      headers: { origin: "http://127.0.0.1:3000" },
      payload: { email, redirectTo: "http://127.0.0.1:3000/recover" },
    });
    expect(requested.statusCode).toBe(200);
    expect(requested.json()).toMatchObject({ status: true });
    expect(passwordResetLinks).toHaveLength(before + 1);
    const resetUrl = new URL(passwordResetLinks.at(-1) ?? "");
    const token = resetUrl.pathname.split("/").at(-1);
    expect(token).toBeTruthy();
    const reset = await server.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      headers: { origin: "http://127.0.0.1:3000" },
      payload: { newPassword, token },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toEqual({ status: true });
    const replay = await server.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      headers: { origin: "http://127.0.0.1:3000" },
      payload: { newPassword, token },
    });
    expect(replay.statusCode).toBe(400);
    const signedIn = await runtime.auth.api.signInEmail({
      body: { email, password: newPassword },
    });
    expect(signedIn.user.email).toBe(email);
    expect(signedIn.token).toBeTruthy();
  }, 20_000);

  it("enables verified TOTP and consumes a recovery code during a real sign-in challenge", async () => {
    const email = `totp-${randomUUID()}@example.test`;
    const password = "totp integration password has enough length 2026";
    await runtime.auth.api.signUpEmail({
      body: { name: "TOTP User", email, password },
    });
    const client = createDatabaseClient(databaseUrl);
    await client.connect();
    try {
      await client.query(
        'update "user" set "emailVerified"=true where email=$1',
        [email],
      );
    } finally {
      await client.end();
    }
    const signIn = await server.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin: "http://127.0.0.1:3000" },
      payload: { email, password },
    });
    expect(signIn.statusCode).toBe(200);
    const sessionCookie = cookieHeader(signIn.headers["set-cookie"]);
    const enabled = await server.inject({
      method: "POST",
      url: "/api/auth/two-factor/enable",
      headers: {
        origin: "http://127.0.0.1:3000",
        cookie: sessionCookie,
      },
      payload: { password },
    });
    expect(enabled.statusCode).toBe(200);
    const setup = enabled.json<{ totpURI: string; backupCodes: string[] }>();
    expect(setup.backupCodes.length).toBeGreaterThanOrEqual(8);
    const secret = new URL(setup.totpURI).searchParams.get("secret");
    expect(secret).toBeTruthy();
    if (Math.floor(Date.now() / 1_000) % 30 > 27)
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    const verified = await server.inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-totp",
      headers: {
        origin: "http://127.0.0.1:3000",
        cookie: sessionCookie,
      },
      payload: { code: totp(secret ?? ""), trustDevice: false },
    });
    expect(verified.statusCode).toBe(200);
    const challenged = await server.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin: "http://127.0.0.1:3000" },
      payload: { email, password },
    });
    expect(challenged.statusCode).toBe(200);
    expect(challenged.json()).toMatchObject({ twoFactorRedirect: true });
    const challengeCookie = cookieHeader(challenged.headers["set-cookie"]);
    const recovered = await server.inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-backup-code",
      headers: {
        origin: "http://127.0.0.1:3000",
        cookie: challengeCookie,
      },
      payload: { code: setup.backupCodes[0], trustDevice: false },
    });
    expect(recovered.statusCode).toBe(200);
    const replay = await server.inject({
      method: "POST",
      url: "/api/auth/two-factor/verify-backup-code",
      headers: {
        origin: "http://127.0.0.1:3000",
        cookie: challengeCookie,
      },
      payload: { code: setup.backupCodes[0], trustDevice: false },
    });
    expect(replay.statusCode).toBeGreaterThanOrEqual(400);
  }, 30_000);
});

function cookieHeader(value: string | string[] | undefined): string {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((entry) => entry.split(";", 1)[0]).join("; ");
}

function totp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.toUpperCase().replaceAll("=", "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("invalid base32 TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let index = 0; index < bytes.length; index += 1)
    bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  bytes.fill(0);
  counter.fill(0);
  digest.fill(0);
  return binary.toString().padStart(6, "0");
}
