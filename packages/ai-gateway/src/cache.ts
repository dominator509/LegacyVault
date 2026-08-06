import { Redis } from "ioredis";
import { createHash } from "node:crypto";
import { stableStringify } from "./canonical.js";

export type CacheErrorObserver = (errorClass: string) => void;

export function aiExactCacheNamespace(
  environmentName: string,
  workflowQueueName: string,
): string {
  return `legacy:ai-exact:${createHash("sha256")
    .update(`${environmentName}:${workflowQueueName}`)
    .digest("hex")
    .slice(0, 16)}`;
}

export function aiCacheScopeKey(
  organizationId: string,
  householdId: string,
): string {
  return createHash("sha256")
    .update(stableStringify({ organizationId, householdId }))
    .digest("hex");
}

export class RedisExactCache {
  private readonly redis: Redis;

  constructor(
    redisUrl: string,
    private readonly namespace: string,
    requireTls: boolean,
    private readonly observeError: CacheErrorObserver = () => undefined,
  ) {
    const endpoint = new URL(redisUrl);
    if (requireTls && endpoint.protocol !== "rediss:")
      throw new Error("production AI cache requires TLS Redis");
    if (!/^[a-z0-9][a-z0-9:-]{2,119}$/u.test(namespace))
      throw new Error("AI cache namespace is invalid");
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
    });
    this.redis.on("error", () => undefined);
  }

  private namespaced(key: string): string {
    if (!/^[0-9a-f]{64}$/u.test(key))
      throw new Error("AI cache key is invalid");
    return `${this.namespace}:${key}`;
  }

  private async ready(): Promise<void> {
    if (this.redis.status === "wait") await this.redis.connect();
  }

  async get(key: string): Promise<string | null> {
    try {
      await this.ready();
      return await this.redis.get(this.namespaced(key));
    } catch (error) {
      this.observeError(error instanceof Error ? error.name : "UnknownError");
      return null;
    }
  }

  async set(
    key: string,
    value: string,
    ttlSeconds: number,
    scopeKey?: string,
  ): Promise<void> {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1)
      throw new Error("AI cache TTL is invalid");
    try {
      await this.ready();
      const cacheKey = this.namespaced(key);
      if (scopeKey) {
        if (!/^[0-9a-f]{64}$/u.test(scopeKey))
          throw new Error("AI cache scope key is invalid");
        const scopeIndex = `${this.namespace}:scope:${scopeKey}`;
        await this.redis
          .multi()
          .set(cacheKey, value, "EX", ttlSeconds)
          .sadd(scopeIndex, cacheKey)
          .expire(scopeIndex, ttlSeconds)
          .exec();
      } else {
        await this.redis.set(cacheKey, value, "EX", ttlSeconds);
      }
    } catch (error) {
      this.observeError(error instanceof Error ? error.name : "UnknownError");
    }
  }

  async purgeScope(scopeKey: string): Promise<void> {
    if (!/^[0-9a-f]{64}$/u.test(scopeKey))
      throw new Error("AI cache scope key is invalid");
    try {
      await this.ready();
      const scopeIndex = `${this.namespace}:scope:${scopeKey}`;
      const members = await this.redis.smembers(scopeIndex);
      await this.redis.del(...members, scopeIndex);
    } catch (error) {
      this.observeError(error instanceof Error ? error.name : "UnknownError");
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.ready();
      await this.redis.del(this.namespaced(key));
    } catch (error) {
      this.observeError(error instanceof Error ? error.name : "UnknownError");
    }
  }

  async close(): Promise<void> {
    if (this.redis.status === "wait" || this.redis.status === "end") return;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect(false);
    }
  }
}
