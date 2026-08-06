import { passkey } from "@better-auth/passkey";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import pg from "pg";
import { hashPassword, verifyPassword } from "./password.js";

export interface LegacyAuthConfig {
  databaseUrl: string;
  secret: string;
  baseUrl: string;
  passkeyOrigin: string;
  trustedOrigins: readonly string[];
  relyingPartyId: string;
  production: boolean;
  sendVerificationEmail(input: { email: string; url: string }): Promise<void>;
  sendPasswordResetEmail(input: { email: string; url: string }): Promise<void>;
}

export function createAuthPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: "legacy-vault-auth",
  });
}

export function createLegacyAuthOptions(
  config: LegacyAuthConfig,
  pool = createAuthPool(config.databaseUrl),
): BetterAuthOptions {
  if (config.secret.length < 43) throw new Error("auth secret is too short");
  return {
    appName: "Legacy Vault Concierge",
    baseURL: config.baseUrl,
    secret: config.secret,
    database: pool,
    trustedOrigins: [...config.trustedOrigins],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 14,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 30 * 60,
      password: { hash: hashPassword, verify: verifyPassword },
      sendResetPassword: async ({ user, url }) =>
        config.sendPasswordResetEmail({ email: user.email, url }),
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: 30 * 60,
      sendVerificationEmail: async ({ user, url }) =>
        config.sendVerificationEmail({ email: user.email, url }),
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 5 * 60,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: config.production,
      cookiePrefix: "legacy-vault",
    },
    rateLimit: { enabled: true, window: 60, max: 20, storage: "database" },
    plugins: [
      passkey({
        rpID: config.relyingPartyId,
        rpName: "Legacy Vault Concierge",
        origin: config.passkeyOrigin,
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
      }),
      twoFactor({
        issuer: "Legacy Vault Concierge",
        allowPasswordless: true,
        skipVerificationOnEnable: false,
        twoFactorCookieMaxAge: 10 * 60,
        trustDeviceMaxAge: 7 * 24 * 60 * 60,
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 5,
          durationSeconds: 15 * 60,
        },
      }),
    ],
  } satisfies BetterAuthOptions;
}

export function createLegacyAuth(config: LegacyAuthConfig) {
  const pool = createAuthPool(config.databaseUrl);
  return {
    auth: betterAuth(createLegacyAuthOptions(config, pool)),
    close: () => pool.end(),
  };
}
