import { getMigrations } from "better-auth/db/migration";
import {
  createAuthPool,
  createLegacyAuthOptions,
} from "../packages/auth/src/auth.js";

async function main(): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const secret = process.env.SESSION_SECRET;
  const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3001";
  if (!databaseUrl || !secret)
    throw new Error(
      "auth migration compile requires local database and session configuration",
    );

  const pool = createAuthPool(databaseUrl);
  const options = createLegacyAuthOptions(
    {
      databaseUrl,
      secret,
      baseUrl,
      trustedOrigins: [process.env.APP_BASE_URL ?? "http://127.0.0.1:3000"],
      relyingPartyId: new URL(baseUrl).hostname,
      production: false,
      sendVerificationEmail: async () => {
        throw new Error("email is unavailable during schema compilation");
      },
      sendPasswordResetEmail: async () => {
        throw new Error("email is unavailable during schema compilation");
      },
    },
    pool,
  );

  try {
    const migrations = await getMigrations(options);
    process.stdout.write(await migrations.compileMigrations());
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const diagnostic =
    error instanceof Error
      ? (error.stack ?? error.name)
          .replace(/postgres(?:ql)?:\/\/[^\s]+/giu, "postgresql://<redacted>")
          .replaceAll(process.env.SESSION_SECRET ?? "<no-secret>", "<redacted>")
      : "unknown";
  process.stderr.write(`auth schema compile failed: ${diagnostic}\n`);
  process.exitCode = 1;
});
