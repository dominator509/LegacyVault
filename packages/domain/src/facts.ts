import type {
  CandidateFact,
  ConfirmedFact,
  Identifier,
  IsoDateTime,
} from "./entities.js";

export class DomainInvariantError extends Error {
  override readonly name = "DomainInvariantError";
}

export function confirmFact(
  fact: CandidateFact,
  actorId: Identifier,
  confirmedAt: IsoDateTime,
): ConfirmedFact {
  if (fact.status !== "candidate" && fact.status !== "disputed")
    throw new DomainInvariantError(
      "only candidate or disputed facts can be confirmed",
    );
  if (fact.evidenceIds.length === 0 && fact.sourceType !== "manual")
    throw new DomainInvariantError(
      "non-manual facts require evidence before confirmation",
    );
  if (!actorId || !confirmedAt)
    throw new DomainInvariantError("confirmation actor and time are required");
  return {
    ...fact,
    status: "confirmed",
    confirmedBy: actorId,
    confirmedAt,
    version: fact.version + 1,
  };
}

export function rejectFact(fact: CandidateFact): CandidateFact {
  if (fact.status === "confirmed")
    throw new DomainInvariantError(
      "confirmed facts require a dispute workflow",
    );
  return { ...fact, status: "rejected", version: fact.version + 1 };
}

export function assertOptimisticVersion(
  actual: number,
  expected: number,
): void {
  if (actual !== expected)
    throw new DomainInvariantError("record version conflict");
}
