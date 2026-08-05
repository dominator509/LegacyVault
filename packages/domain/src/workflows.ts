import type {
  CandidateFact,
  Consent,
  EmergencyAccessRequest,
  EmergencyAccessStatus,
  IsoDateTime,
  Report,
  ReportClaim,
  WorkflowRun,
} from "./entities.js";
import { DomainInvariantError } from "./facts.js";

export function hasActiveConsent(
  consents: readonly Consent[],
  purpose: Consent["purpose"],
  policyVersion: string,
): boolean {
  return consents.some(
    (consent) =>
      consent.purpose === purpose &&
      consent.policyVersion === policyVersion &&
      !consent.withdrawnAt,
  );
}

export function createReportClaims(
  facts: readonly CandidateFact[],
): ReportClaim[] {
  return facts.map((fact) => ({
    factId: fact.id,
    evidenceIds: fact.evidenceIds,
    fieldKey: fact.fieldKey,
    renderedValue: fact.status === "confirmed" ? String(fact.typedValue) : "",
    status:
      fact.status === "confirmed"
        ? "confirmed"
        : fact.status === "disputed"
          ? "disputed"
          : "missing",
  }));
}

export function assertReportProvenance(report: Report): void {
  for (const claim of report.claims) {
    if (claim.status === "confirmed" && claim.evidenceIds.length === 0)
      throw new DomainInvariantError(
        "confirmed report claim requires evidence",
      );
    if (!(claim.factId in report.sourceFactVersions))
      throw new DomainInvariantError(
        "report claim requires a source fact version",
      );
  }
}

const emergencyTransitions: Readonly<
  Record<EmergencyAccessStatus, readonly EmergencyAccessStatus[]>
> = {
  requested: ["approved", "denied", "delayed", "revoked"],
  approved: ["delayed", "released", "revoked"],
  denied: [],
  delayed: ["approved", "denied", "released", "revoked"],
  released: ["revoked"],
  revoked: [],
};

export function transitionEmergencyAccess(
  request: EmergencyAccessRequest,
  next: EmergencyAccessStatus,
  at: IsoDateTime,
): EmergencyAccessRequest {
  if (!emergencyTransitions[request.status].includes(next))
    throw new DomainInvariantError(
      `invalid emergency access transition: ${request.status} to ${next}`,
    );
  if (
    next === "released" &&
    request.releaseAfter &&
    Date.parse(at) < Date.parse(request.releaseAfter)
  )
    throw new DomainInvariantError("emergency access delay has not elapsed");
  return {
    ...request,
    status: next,
    decisionAt: at,
    version: request.version + 1,
  };
}

export function completeWorkflowStep(
  workflow: WorkflowRun,
  step: string,
  nextStep?: string,
): WorkflowRun {
  if (workflow.completedSteps.includes(step)) return workflow;
  const completedSteps = [...workflow.completedSteps, step];
  if (nextStep) {
    return { ...workflow, completedSteps, status: "running", nextStep, version: workflow.version + 1 };
  }
  const { nextStep: _completedStep, ...withoutNextStep } = workflow;
  return { ...withoutNextStep, completedSteps, status: "completed", version: workflow.version + 1 };
}
