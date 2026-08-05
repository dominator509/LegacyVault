import { describe, expect, it } from "vitest";
import {
  assertReportProvenance,
  completeWorkflowStep,
  confirmFact,
  createReportClaims,
  hasActiveConsent,
  isEligibleForDeletion,
  permits,
  transitionEmergencyAccess,
  type CandidateFact,
  type Consent,
  type EmergencyAccessRequest,
  type PermissionGrant,
  type Report,
  type WorkflowRun,
} from "../../packages/domain/src/index.js";

const tenant = { organizationId: "org-1", householdId: "house-1", version: 1 };
const candidate: CandidateFact = {
  ...tenant,
  id: "fact-1",
  fieldKey: "insurance.carrier",
  typedValue: "Example Mutual",
  status: "candidate",
  sourceType: "document",
  sourceId: "doc-1",
  evidenceIds: ["evidence-1"],
  confidence: 0.92,
  sensitivity: "sensitive",
};

describe("domain invariants", () => {
  it("requires explicit confirmation before a candidate becomes authoritative", () => {
    const confirmed = confirmFact(
      candidate,
      "person-1",
      "2026-08-05T00:00:00Z",
    );
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.version).toBe(2);
    expect(candidate.status).toBe("candidate");
  });

  it("rejects non-manual confirmation without evidence", () => {
    expect(() =>
      confirmFact(
        { ...candidate, evidenceIds: [] },
        "person-1",
        "2026-08-05T00:00:00Z",
      ),
    ).toThrow(/evidence/u);
  });

  it("enforces category and time bounded helper grants", () => {
    const grant: PermissionGrant = {
      ...tenant,
      id: "grant-1",
      membershipId: "member-1",
      categories: ["insurance"],
      actions: ["read"],
      purpose: "annual review",
      startsAt: "2026-08-01T00:00:00Z",
      expiresAt: "2026-09-01T00:00:00Z",
    };
    expect(
      permits(
        "FamilyHelper",
        [grant],
        "insurance",
        "read",
        "2026-08-05T00:00:00Z",
      ),
    ).toBe(true);
    expect(
      permits(
        "FamilyHelper",
        [grant],
        "property",
        "read",
        "2026-08-05T00:00:00Z",
      ),
    ).toBe(false);
    expect(
      permits(
        "FamilyHelper",
        [grant],
        "insurance",
        "read",
        "2026-10-01T00:00:00Z",
      ),
    ).toBe(false);
  });

  it("never gives PlatformAdmin standing vault permissions", () => {
    expect(
      permits("PlatformAdmin", [], "assets", "read", "2026-08-05T00:00:00Z"),
    ).toBe(false);
  });

  it("requires purpose, policy version, and non-withdrawn consent", () => {
    const consent: Consent = {
      ...tenant,
      id: "consent-1",
      personId: "person-1",
      purpose: "external-ai",
      policyVersion: "ai-notice-1",
      grantedAt: "2026-08-05T00:00:00Z",
    };
    expect(hasActiveConsent([consent], "external-ai", "ai-notice-1")).toBe(
      true,
    );
    expect(
      hasActiveConsent(
        [{ ...consent, withdrawnAt: "2026-08-06T00:00:00Z" }],
        "external-ai",
        "ai-notice-1",
      ),
    ).toBe(false);
  });

  it("renders unconfirmed report facts as missing instead of authoritative", () => {
    const [claim] = createReportClaims([candidate]);
    expect(claim).toMatchObject({ status: "missing", renderedValue: "" });
  });

  it("requires evidence and source version for confirmed report claims", () => {
    const report: Report = {
      ...tenant,
      id: "report-1",
      kind: "family-emergency-guide",
      generatedAt: "2026-08-05T00:00:00Z",
      claims: [
        {
          factId: "fact-1",
          evidenceIds: [],
          fieldKey: "x",
          renderedValue: "y",
          status: "confirmed",
        },
      ],
      sourceFactVersions: { "fact-1": 2 },
    };
    expect(() => assertReportProvenance(report)).toThrow(/evidence/u);
  });

  it("enforces emergency release delay", () => {
    const request: EmergencyAccessRequest = {
      ...tenant,
      id: "emergency-1",
      requesterId: "person-2",
      recipientMembershipId: "member-2",
      categories: ["medical-summary"],
      reason: "hospitalization",
      status: "approved",
      requestedAt: "2026-08-05T00:00:00Z",
      releaseAfter: "2026-08-07T00:00:00Z",
    };
    expect(() =>
      transitionEmergencyAccess(request, "released", "2026-08-06T00:00:00Z"),
    ).toThrow(/delay/u);
    expect(
      transitionEmergencyAccess(request, "released", "2026-08-07T00:00:00Z")
        .status,
    ).toBe("released");
  });

  it("makes workflow steps idempotent and resumable", () => {
    const workflow: WorkflowRun = {
      ...tenant,
      id: "workflow-1",
      kind: "deletion",
      idempotencyKey: "idempotency-key-1",
      status: "running",
      completedSteps: [],
      nextStep: "active-database",
    };
    const completed = completeWorkflowStep(
      workflow,
      "active-database",
      "objects",
    );
    expect(completeWorkflowStep(completed, "active-database", "objects")).toBe(
      completed,
    );
  });

  it("respects scoped legal holds during retention", () => {
    const rule = {
      category: "original-documents" as const,
      activeDays: 30,
      postAccountDays: 30,
      legalHoldEligible: true,
    };
    expect(isEligibleForDeletion(rule, 31, true, false)).toBe(true);
    expect(isEligibleForDeletion(rule, 31, true, true)).toBe(false);
  });
});
