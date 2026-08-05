import { randomUUID } from "node:crypto";
import pg from "pg";
import type { PermissionAction, RecordCategory } from "@legacy/domain";
import type { AuthenticatedTenantIdentity } from "./identity.js";

export interface AccessAuthorizer {
  (
    identity: AuthenticatedTenantIdentity,
    scope: {
      category: RecordCategory;
      action: PermissionAction;
      purpose: string;
    },
  ): void | Promise<void>;
}

export class AccessApprovalValidationError extends Error {
  override readonly name = "AccessApprovalValidationError";
}

export class PostgresAccessApprovalStore {
  readonly #pool: pg.Pool;
  constructor(
    databaseUrl: string,
    private readonly authorize: AccessAuthorizer,
  ) {
    this.#pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      application_name: "legacy-vault-access-approval",
    });
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async approveSupportAccess(
    owner: AuthenticatedTenantIdentity,
    input: {
      supportMembershipId: string;
      reasonCode: string;
      categories: readonly RecordCategory[];
      startsAt: string;
      expiresAt: string;
    },
  ): Promise<{ id: string; version: number }> {
    if (!input.reasonCode.match(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/u))
      throw new AccessApprovalValidationError("reason code is invalid");
    if (
      input.categories.length === 0 ||
      new Set(input.categories).size !== input.categories.length
    )
      throw new AccessApprovalValidationError("categories are invalid");
    const startsAt = Date.parse(input.startsAt);
    const expiresAt = Date.parse(input.expiresAt);
    if (
      !Number.isFinite(startsAt) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= startsAt ||
      expiresAt - startsAt > 4 * 60 * 60 * 1_000
    )
      throw new AccessApprovalValidationError("approval period is invalid");
    for (const category of input.categories)
      await this.authorize(owner, {
        category,
        action: "approve",
        purpose: "vault.support-access.approve",
      });

    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [owner.organizationId, owner.householdId],
      );
      const target = await client.query<{ role: string; active: number }>(
        "select role,active from memberships where id=$1",
        [input.supportMembershipId],
      );
      if (
        target.rows[0]?.role !== "SupportAgent" ||
        target.rows[0]?.active !== 1
      )
        throw new AccessApprovalValidationError(
          "support membership is unavailable",
        );
      const result = await client.query<{ id: string; version: number }>(
        "insert into support_access_approvals(id,organization_id,household_id,support_membership_id,approved_by_owner_id,reason_code,categories,starts_at,expires_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,version",
        [
          randomUUID(),
          owner.organizationId,
          owner.householdId,
          input.supportMembershipId,
          owner.actorId,
          input.reasonCode,
          JSON.stringify(input.categories),
          input.startsAt,
          input.expiresAt,
        ],
      );
      const row = result.rows[0];
      if (!row)
        throw new AccessApprovalValidationError("approval was not persisted");
      await client.query("commit");
      return row;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeSupportAccess(
    owner: AuthenticatedTenantIdentity,
    approvalId: string,
    expectedVersion: number,
  ): Promise<{ id: string; version: number; revokedAt: string }> {
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('app.organization_id',$1,true),set_config('app.household_id',$2,true)",
        [owner.organizationId, owner.householdId],
      );
      const existing = await client.query<{ categories: unknown }>(
        "select categories from support_access_approvals where id=$1 and revoked_at is null",
        [approvalId],
      );
      const categories = existing.rows[0]?.categories;
      if (
        !Array.isArray(categories) ||
        !categories.every((category) => typeof category === "string")
      )
        throw new AccessApprovalValidationError("approval is unavailable");
      for (const category of categories as RecordCategory[])
        await this.authorize(owner, {
          category,
          action: "approve",
          purpose: "vault.support-access.revoke",
        });
      const result = await client.query<{
        id: string;
        version: number;
        revoked_at: Date;
      }>(
        "update support_access_approvals set revoked_at=now(),version=version+1 where id=$1 and version=$2 and revoked_at is null returning id,version,revoked_at",
        [approvalId, expectedVersion],
      );
      const row = result.rows[0];
      if (!row)
        throw new AccessApprovalValidationError(
          "approval revocation conflict or unavailable",
        );
      await client.query("commit");
      return {
        id: row.id,
        version: row.version,
        revokedAt: row.revoked_at.toISOString(),
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
