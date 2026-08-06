import { createHash, randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import { createApplicationRuntime } from "../../apps/api/src/runtime.js";
import { loadEnvironment } from "../../packages/contracts/src/environment.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const local = readLocalEnvironment();

describe("consent-bound AI interview live fire", () => {
  it("uses DeepSeek only after active consent and replays the exact tenant request", async () => {
    const endpoint = new URL(local.DEEPSEEK_BASE_URL ?? "");
    if (
      endpoint.protocol !== "https:" ||
      endpoint.hostname !== "api.deepseek.com"
    )
      throw new Error("DeepSeek live-fire endpoint is not the approved host");
    const objectStore = new URL(local.R2_ENDPOINT ?? "");
    if (!["127.0.0.1", "localhost", "::1"].includes(objectStore.hostname))
      throw new Error("live-fire object storage must remain loopback");
    const environment = loadEnvironment({
      NODE_ENV: "test",
      LOCAL_ENGINEERING_MODE: "true",
      DATABASE_URL: local.TEST_DATABASE_URL,
      SESSION_SECRET: local.SESSION_SECRET,
      AUDIT_HMAC_KEY: local.AUDIT_HMAC_KEY,
      APP_ENCRYPTION_KEK: local.APP_ENCRYPTION_KEK,
      EXPORT_SIGNING_KEY: local.EXPORT_SIGNING_KEY,
      REDIS_URL: local.REDIS_URL,
      WORKFLOW_QUEUE_NAME: `legacy-ai-live-test-${process.pid}`,
      API_BASE_URL: "http://127.0.0.1:3001",
      APP_BASE_URL: "http://127.0.0.1:3000",
      EMAIL_FROM: "Legacy Vault <notices@localhost.invalid>",
      R2_ACCESS_KEY_ID: local.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: local.R2_SECRET_ACCESS_KEY,
      R2_BUCKET: local.R2_BUCKET,
      R2_ENDPOINT: local.R2_ENDPOINT,
      DEEPSEEK_API_KEY: local.DEEPSEEK_API_KEY,
      DEEPSEEK_BASE_URL: local.DEEPSEEK_BASE_URL,
      DEEPSEEK_MODEL: local.DEEPSEEK_MODEL,
    });
    await runMigrations(environment.DATABASE_URL ?? "");
    let runtime = createApplicationRuntime(environment);
    const organizationId = randomUUID();
    const householdId = randomUUID();
    const actorId = randomUUID();
    const identity = {
      organizationId,
      householdId,
      actorId,
      membershipId: randomUUID(),
      role: "Owner" as const,
      grants: [],
      supportApprovals: [],
      emergencyReleaseCategories: [],
      sessionIssuedAt: new Date().toISOString(),
      mfaVerifiedAt: new Date().toISOString(),
    };
    const client = createDatabaseClient(environment.DATABASE_URL ?? "");
    await client.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.organization_id',$1,true)", [
        organizationId,
      ]);
      await client.query("insert into organizations(id,name) values ($1,$2)", [
        organizationId,
        "Synthetic AI Live Fire",
      ]);
      await client.query("select set_config('app.household_id',$1,true)", [
        householdId,
      ]);
      await client.query(
        "insert into households(id,organization_id,name) values ($1,$2,$3)",
        [householdId, organizationId, "Synthetic AI Household"],
      );
      await client.query("commit");
      const consent = await runtime.dependencies.repository.recordConsent(
        identity,
        {
          personId: actorId,
          purpose: "external-ai",
          policyVersion: "ai-notice-live-fire-v1",
          grantedAt: new Date().toISOString(),
        },
      );
      const request = {
        message: "My insurance carrier is Example Mutual.",
        categories: ["insurance" as const],
        expectedConsentVersion: consent.version,
        idempotencyKey: `ai-live-${randomUUID()}`,
      };
      const first = await runtime.dependencies.runAiInterview?.(
        identity,
        request,
      );
      const namespace = `legacy:ai-exact:${createHash("sha256")
        .update(`${environment.NODE_ENV}:${environment.WORKFLOW_QUEUE_NAME}`)
        .digest("hex")
        .slice(0, 16)}`;
      const redis = new Redis(environment.REDIS_URL ?? "", {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      });
      try {
        await redis.connect();
        const keys = await redis.keys(`${namespace}:*`);
        const valueKeys = keys.filter((key) => !key.includes(":scope:"));
        expect(valueKeys).toHaveLength(1);
        expect(keys.filter((key) => key.includes(":scope:"))).toHaveLength(1);
        const cachedCiphertext = await redis.get(valueKeys[0] ?? "");
        expect(cachedCiphertext).toContain('"algorithm":"A256GCM"');
        expect(cachedCiphertext).not.toContain("Example Mutual");
        expect(cachedCiphertext).not.toContain("proposedValue");
      } finally {
        await redis.quit();
      }
      await runtime.close();
      runtime = createApplicationRuntime(environment);
      const replay = await runtime.dependencies.runAiInterview?.(identity, {
        ...request,
        idempotencyKey: `ai-live-cache-replay-${randomUUID()}`,
      });
      expect(replay).toEqual(first);
      expect(first).toMatchObject({
        provider: "deepseek",
        authoritative: false,
        categoriesSent: ["insurance"],
        consent: {
          id: consent.id,
          policyVersion: "ai-notice-live-fire-v1",
          version: consent.version,
        },
      });
      await runtime.dependencies.repository.withdrawConsent(
        identity,
        consent.id,
        consent.version,
        new Date().toISOString(),
      );
      await expect(
        runtime.dependencies.runAiInterview?.(identity, {
          ...request,
          idempotencyKey: `ai-live-${randomUUID()}`,
        }),
      ).rejects.toThrow("affirmative external AI consent is required");
    } finally {
      await client.end();
      await runtime.close();
    }
  }, 60_000);
});
