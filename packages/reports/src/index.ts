import {
  assertReportProvenance,
  createReportClaims,
  type CandidateFact,
  type Report,
} from "@legacy/domain";

export function generateReport(input: {
  id: string;
  organizationId: string;
  householdId: string;
  kind: Report["kind"];
  generatedAt: string;
  facts: readonly CandidateFact[];
}): Report {
  const report: Report = {
    id: input.id,
    organizationId: input.organizationId,
    householdId: input.householdId,
    kind: input.kind,
    generatedAt: input.generatedAt,
    claims: createReportClaims(input.facts),
    sourceFactVersions: Object.fromEntries(
      input.facts.map((fact) => [fact.id, fact.version]),
    ),
    version: 1,
  };
  assertReportProvenance(report);
  return report;
}
