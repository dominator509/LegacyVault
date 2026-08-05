import { createHmac, timingSafeEqual } from "node:crypto";
export interface AuditEventInput {
  organizationId: string;
  householdId: string;
  sequence: number;
  occurredAt: string;
  actorPseudonym: string;
  action: string;
  outcome: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
  previousHash: string;
}
export interface ChainedAuditEvent extends AuditEventInput {
  eventHash: string;
}
export class AuditIntegrityError extends Error {
  override readonly name = "AuditIntegrityError";
}
const forbiddenMetadataKey =
  /payload|document|fact|prompt|output|email|name|token|secret|password|cookie|authorization/iu;
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function assertMetadata(metadata: AuditEventInput["metadata"]): void {
  for (const [key, value] of Object.entries(metadata)) {
    if (forbiddenMetadataKey.test(key))
      throw new AuditIntegrityError(`audit metadata key is forbidden: ${key}`);
    if (typeof value === "string" && value.length > 120)
      throw new AuditIntegrityError("audit metadata string exceeds safe bound");
  }
}
function eventDigest(input: AuditEventInput, auditKey: Uint8Array): string {
  if (auditKey.byteLength < 32)
    throw new AuditIntegrityError("audit key must be at least 32 bytes");
  assertMetadata(input.metadata);
  const declaredInput: AuditEventInput = {
    organizationId: input.organizationId,
    householdId: input.householdId,
    sequence: input.sequence,
    occurredAt: input.occurredAt,
    actorPseudonym: input.actorPseudonym,
    action: input.action,
    outcome: input.outcome,
    metadata: input.metadata,
    previousHash: input.previousHash,
  };
  return createHmac("sha256", auditKey)
    .update(canonicalize(declaredInput))
    .digest("hex");
}
export function createAuditEvent(
  input: AuditEventInput,
  auditKey: Uint8Array,
): ChainedAuditEvent {
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1)
    throw new AuditIntegrityError("audit sequence must be positive");
  return { ...input, eventHash: eventDigest(input, auditKey) };
}
export function verifyAuditChain(
  events: readonly ChainedAuditEvent[],
  auditKey: Uint8Array,
): boolean {
  let previousHash = "GENESIS";
  for (const [index, event] of events.entries()) {
    if (event.sequence !== index + 1 || event.previousHash !== previousHash)
      return false;
    const { eventHash, ...input } = event;
    const expected = Buffer.from(eventDigest(input, auditKey), "hex");
    const actual = Buffer.from(eventHash, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return false;
    previousHash = eventHash;
  }
  return true;
}
export function pseudonymizeIdentifier(
  identifier: string,
  auditKey: Uint8Array,
): string {
  if (auditKey.byteLength < 32)
    throw new AuditIntegrityError("audit key must be at least 32 bytes");
  return createHmac("sha256", auditKey)
    .update("legacy-vault:audit-pseudonym:")
    .update(identifier)
    .digest("hex")
    .slice(0, 32);
}

export * from "./store.js";
