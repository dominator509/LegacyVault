import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  aiCacheScopeKey,
  RedisExactCache,
} from "../../packages/ai-gateway/src/index.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const local = readLocalEnvironment();

describe("real Redis AI exact cache", () => {
  it("stores opaque values with expiry and supports deterministic deletion", async () => {
    const namespace = `test:ai-cache:${randomUUID().replaceAll("-", "")}`;
    const key = "a".repeat(64);
    const secondKey = "b".repeat(64);
    const scopeKey = aiCacheScopeKey(randomUUID(), randomUUID());
    const errors: string[] = [];
    const cache = new RedisExactCache(
      local.REDIS_URL ?? "",
      namespace,
      false,
      (errorClass) => errors.push(errorClass),
    );
    try {
      await cache.set(key, "opaque-ciphertext", 60, scopeKey);
      await cache.set(secondKey, "second-ciphertext", 60, scopeKey);
      await expect(cache.get(key)).resolves.toBe("opaque-ciphertext");
      await cache.purgeScope(scopeKey);
      await expect(cache.get(key)).resolves.toBeNull();
      await expect(cache.get(secondKey)).resolves.toBeNull();
      expect(errors).toEqual([]);
      await expect(cache.get("not-a-cache-key")).resolves.toBeNull();
      expect(errors).toEqual(["Error"]);
    } finally {
      await cache.close();
    }
  });

  it("rejects plaintext Redis configuration for production", () => {
    expect(
      () =>
        new RedisExactCache(
          "redis://127.0.0.1:6379",
          "production:ai-cache",
          true,
        ),
    ).toThrow("production AI cache requires TLS Redis");
  });
});
