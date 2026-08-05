import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createAuditEvent,
  pseudonymizeIdentifier,
  verifyAuditChain,
} from "../../packages/audit/src/index.js";
describe("tamper-evident content-free audit chain", () => {
  it("verifies sequence and hash continuity and rejects mutation", () => {
    const key = randomBytes(32);
    const first = createAuditEvent(
      {
        organizationId: "org-pseudonym",
        householdId: "house-pseudonym",
        sequence: 1,
        occurredAt: "2026-08-05T00:00:00.000Z",
        actorPseudonym: pseudonymizeIdentifier("actor-1", key),
        action: "fact.confirm",
        outcome: "allowed",
        metadata: { category: "insurance", policy_decision: "allow" },
        previousHash: "GENESIS",
      },
      key,
    );
    const second = createAuditEvent(
      {
        ...first,
        sequence: 2,
        occurredAt: "2026-08-05T00:01:00.000Z",
        action: "report.generate",
        previousHash: first.eventHash,
      },
      key,
    );
    expect(verifyAuditChain([first, second], key)).toBe(true);
    expect(
      verifyAuditChain([{ ...first, outcome: "denied" }, second], key),
    ).toBe(false);
  });
  it("rejects sensitive metadata keys", () => {
    expect(() =>
      createAuditEvent(
        {
          organizationId: "org",
          householdId: "house",
          sequence: 1,
          occurredAt: "2026-08-05T00:00:00.000Z",
          actorPseudonym: "actor",
          action: "test",
          outcome: "allowed",
          metadata: { document_name: "forbidden" },
          previousHash: "GENESIS",
        },
        randomBytes(32),
      ),
    ).toThrow(/forbidden/);
  });
});
