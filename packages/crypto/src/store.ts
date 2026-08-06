import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  createWrappedHouseholdKey,
  unwrapHouseholdKey,
  type WrappedHouseholdKey,
} from "./index.js";

export interface HouseholdKeyContext {
  organizationId: string;
  householdId: string;
}

export interface ActiveHouseholdKey {
  keyVersion: number;
  plaintextKey: Uint8Array;
}

function wrappedHouseholdKey(value: unknown): WrappedHouseholdKey {
  if (!value || typeof value !== "object")
    throw new Error("stored household key is invalid");
  const candidate = value as Partial<WrappedHouseholdKey>;
  if (
    candidate.algorithm !== "A256GCM" ||
    candidate.keyPurpose !== "household-dek" ||
    !Number.isSafeInteger(candidate.keyVersion) ||
    typeof candidate.iv !== "string" ||
    typeof candidate.ciphertext !== "string" ||
    typeof candidate.authenticationTag !== "string"
  )
    throw new Error("stored household key is invalid");
  return candidate as WrappedHouseholdKey;
}

export class PostgresHouseholdKeyStore {
  readonly #pool: pg.Pool;
  constructor(
    databaseUrl: string,
    private readonly keyEncryptionKey: Uint8Array,
  ) {
    if (keyEncryptionKey.byteLength !== 32)
      throw new Error("key encryption key must be exactly 32 bytes");
    this.#pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      application_name: "legacy-vault-household-keys",
    });
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async getOrCreateActiveKey(
    context: HouseholdKeyContext,
  ): Promise<ActiveHouseholdKey> {
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [context.organizationId, context.householdId],
      );
      let existing = await client.query<{
        key_version: number;
        wrapped_key: unknown;
      }>(
        "select key_version,wrapped_key from household_keys where status='active' order by key_version desc limit 1",
      );
      const row = existing.rows[0];
      if (row) {
        const plaintextKey = unwrapHouseholdKey(
          wrappedHouseholdKey(row.wrapped_key),
          this.keyEncryptionKey,
          context.organizationId,
          context.householdId,
        );
        await client.query("commit");
        return { keyVersion: row.key_version, plaintextKey };
      }
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1,0))",
        [`household-key:${context.householdId}`],
      );
      existing = await client.query<{
        key_version: number;
        wrapped_key: unknown;
      }>(
        "select key_version,wrapped_key from household_keys where status='active' order by key_version desc limit 1",
      );
      const afterLock = existing.rows[0];
      if (afterLock) {
        const plaintextKey = unwrapHouseholdKey(
          wrappedHouseholdKey(afterLock.wrapped_key),
          this.keyEncryptionKey,
          context.organizationId,
          context.householdId,
        );
        await client.query("commit");
        return { keyVersion: afterLock.key_version, plaintextKey };
      }
      const keyVersion = 1;
      const generated = createWrappedHouseholdKey({
        keyEncryptionKey: this.keyEncryptionKey,
        organizationId: context.organizationId,
        householdId: context.householdId,
        keyVersion,
      });
      await client.query(
        "insert into household_keys(id,organization_id,household_id,key_version,wrapped_key,status,created_at) values ($1,$2,$3,$4,$5,'active',now())",
        [
          randomUUID(),
          context.organizationId,
          context.householdId,
          keyVersion,
          JSON.stringify(generated.wrappedKey),
        ],
      );
      await client.query("commit");
      return { keyVersion, plaintextKey: generated.plaintextKey };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
