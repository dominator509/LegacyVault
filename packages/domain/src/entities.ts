export type Identifier = string;
export type IsoDateTime = string;
export type Role =
  | "Owner"
  | "CoOwner"
  | "Editor"
  | "FamilyHelper"
  | "ProfessionalAdvisor"
  | "ReadOnlyViewer"
  | "EmergencyRecipient"
  | "SupportAgent"
  | "PlatformAdmin";
export type RecordCategory =
  | "contacts"
  | "advisers"
  | "dependents"
  | "pets"
  | "assets"
  | "liabilities"
  | "insurance"
  | "property"
  | "estate-documents"
  | "medical-summary"
  | "digital-asset-locations"
  | "household-instructions"
  | "funeral-preferences";
export type FactStatus = "candidate" | "confirmed" | "rejected" | "disputed";
export type Sensitivity = "standard" | "sensitive" | "highly-sensitive";
export type SourceType = "manual" | "document" | "interview" | "professional";

export interface TenantEntity {
  id: Identifier;
  organizationId: Identifier;
  householdId: Identifier;
  version: number;
}
export interface Organization {
  id: Identifier;
  name: string;
}
export interface Household {
  id: Identifier;
  organizationId: Identifier;
  name: string;
  lastReviewedAt?: IsoDateTime;
}
export interface Person extends TenantEntity {
  displayName: string;
}
export interface Membership extends TenantEntity {
  personId: Identifier;
  role: Role;
  active: boolean;
}
export type PermissionAction =
  "read" | "create" | "update" | "delete" | "export" | "approve";
export interface PermissionGrant extends TenantEntity {
  membershipId: Identifier;
  categories: readonly RecordCategory[];
  actions: readonly PermissionAction[];
  purpose: string;
  startsAt: IsoDateTime;
  expiresAt?: IsoDateTime;
  revokedAt?: IsoDateTime;
}
export interface Evidence extends TenantEntity {
  sourceType: SourceType;
  sourceId: Identifier;
  locator: string;
  capturedAt: IsoDateTime;
}
export interface CandidateFact extends TenantEntity {
  fieldKey: string;
  typedValue: unknown;
  status: FactStatus;
  sourceType: SourceType;
  sourceId: Identifier;
  evidenceIds: readonly Identifier[];
  confidence?: number;
  sensitivity: Sensitivity;
  confirmedBy?: Identifier;
  confirmedAt?: IsoDateTime;
  lastReviewedAt?: IsoDateTime;
}
export interface ConfirmedFact extends CandidateFact {
  status: "confirmed";
  confirmedBy: Identifier;
  confirmedAt: IsoDateTime;
}
export interface Contradiction extends TenantEntity {
  factIds: readonly [Identifier, Identifier];
  status: "open" | "resolved";
}
export type ConsentPurpose =
  | "external-ai"
  | "sensitive-data"
  | "document-processing"
  | "transactional-email"
  | "terms"
  | "privacy-policy";
export interface Consent extends TenantEntity {
  personId: Identifier;
  purpose: ConsentPurpose;
  policyVersion: string;
  grantedAt: IsoDateTime;
  withdrawnAt?: IsoDateTime;
}
export interface ReportClaim {
  factId: Identifier;
  evidenceIds: readonly Identifier[];
  fieldKey: string;
  renderedValue: string;
  status: "confirmed" | "missing" | "disputed";
}
export type ReportKind =
  | "life-inventory"
  | "family-emergency-guide"
  | "executor-preparation-packet"
  | "beneficiary-review-checklist"
  | "document-gap-report"
  | "household-continuity-guide"
  | "annual-review";
export interface AnnualReviewFindings {
  staleFactIds: readonly Identifier[];
  expiringDocumentIds: readonly Identifier[];
  contradictions: readonly {
    fieldKey: string;
    factIds: readonly Identifier[];
  }[];
}
export interface Report extends TenantEntity {
  kind: ReportKind;
  generatedAt: IsoDateTime;
  claims: readonly ReportClaim[];
  sourceFactVersions: Readonly<Record<Identifier, number>>;
  missingCategories?: readonly RecordCategory[];
  notices?: readonly string[];
  reviewFindings?: AnnualReviewFindings;
}
export type EmergencyAccessStatus =
  "requested" | "approved" | "denied" | "delayed" | "released" | "revoked";
export interface EmergencyAccessRequest extends TenantEntity {
  requesterId: Identifier;
  recipientMembershipId: Identifier;
  categories: readonly RecordCategory[];
  reason: string;
  status: EmergencyAccessStatus;
  requestedAt: IsoDateTime;
  decisionAt?: IsoDateTime;
  releaseAfter?: IsoDateTime;
  deniedReason?: string;
}
export interface WorkflowRun extends TenantEntity {
  kind: "export" | "deletion" | "annual-review";
  idempotencyKey: string;
  status: "pending" | "running" | "blocked" | "completed" | "failed";
  completedSteps: readonly string[];
  nextStep?: string;
  lastErrorClass?: string;
}
export interface PrivacyRequest extends TenantEntity {
  personId: Identifier;
  kind: "access" | "correction" | "export" | "deletion" | "appeal";
  status:
    | "received"
    | "identity-verification"
    | "processing"
    | "completed"
    | "denied";
  requestedAt: IsoDateTime;
}
export interface Subscription extends TenantEntity {
  status: "trialing" | "active" | "past-due" | "canceled" | "refunded";
  plan: "essential";
  providerCustomerId?: string;
  providerSubscriptionId?: string;
}
export type CanonicalRecord =
  | "Contact"
  | "Adviser"
  | "Dependent"
  | "Pet"
  | "AssetRecord"
  | "LiabilityRecord"
  | "InsurancePolicy"
  | "PropertyRecord"
  | "EstateDocumentRecord"
  | "MedicalSummary"
  | "DigitalAssetLocation"
  | "HouseholdInstruction"
  | "FuneralPreference"
  | "Document"
  | "Export"
  | "AuditEvent";
