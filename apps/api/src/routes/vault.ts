import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  TenantContext,
  VaultRepository,
} from "@legacy/database/repository";
import {
  allRecordCategories,
  recordCategoryFromFieldKey,
} from "@legacy/domain";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  type AuthenticatedTenantIdentity,
  HouseholdSelectionRequiredError,
} from "@legacy/auth";
import type { PermissionAction, RecordCategory } from "@legacy/domain";
import type { ReportKind } from "@legacy/domain";
import { scanDlp } from "@legacy/ai-gateway";

export type IdentityResolver = (
  request: FastifyRequest,
) => Promise<AuthenticatedTenantIdentity>;
export type IdentityAuthorizer = (
  identity: AuthenticatedTenantIdentity,
  scope: {
    category: RecordCategory;
    action: PermissionAction;
    purpose: string;
  },
) => void | Promise<void>;

class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    message: string,
  ) {
    super(message);
  }
}

function objectBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ApiProblem(
      400,
      "Invalid request",
      "request body must be an object",
    );
  return body as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0)
    throw new ApiProblem(400, "Invalid request", `${field} is required`);
  return value;
}

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  if (
    typeof value !== "string" ||
    value.length < 16 ||
    value.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/u.test(value)
  )
    throw new ApiProblem(
      400,
      "Invalid request",
      "a valid idempotency-key header is required",
    );
  return value;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requiredUuid(body: Record<string, unknown>, field: string): string {
  const value = requiredString(body, field);
  if (!uuidPattern.test(value))
    throw new ApiProblem(400, "Invalid request", `${field} must be a UUID`);
  return value;
}

function requiredPositiveInteger(
  body: Record<string, unknown>,
  field: string,
): number {
  const value = body[field];
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new ApiProblem(
      400,
      "Invalid request",
      `${field} must be a positive integer`,
    );
  return value as number;
}

function factCategory(fieldKey: string): RecordCategory {
  try {
    return recordCategoryFromFieldKey(fieldKey);
  } catch {
    throw new ApiProblem(
      400,
      "Invalid request",
      "fieldKey must begin with a canonical record category",
    );
  }
}

export async function registerVaultRoutes(
  server: FastifyInstance,
  dependencies: {
    repository: VaultRepository;
    resolveIdentity: IdentityResolver;
    authorizeIdentity?: IdentityAuthorizer;
    startPortableExport?: (
      identity: AuthenticatedTenantIdentity,
      input: { idempotencyKey: string; exportKey: Uint8Array },
    ) => Promise<unknown>;
    confirmPrivacyDeletion?: (
      identity: AuthenticatedTenantIdentity,
      input: {
        requestId: string;
        expectedVersion: number;
        idempotencyKey: string;
      },
    ) => Promise<unknown>;
    cancelPrivacyDeletion?: (
      identity: AuthenticatedTenantIdentity,
      input: {
        requestId: string;
        expectedVersion: number;
        idempotencyKey: string;
      },
    ) => Promise<unknown>;
    encryptFactValue?: (
      identity: AuthenticatedTenantIdentity,
      input: { fieldKey: string; plaintext: Uint8Array },
    ) => Promise<{ id: string; ciphertext: Uint8Array; keyVersion: number }>;
    encryptEmergencyReason?: (
      identity: AuthenticatedTenantIdentity,
      plaintext: Uint8Array,
    ) => Promise<{ id: string; ciphertext: Uint8Array; keyVersion: number }>;
    createReport?: (
      identity: AuthenticatedTenantIdentity,
      kind: ReportKind,
      idempotencyKey: string,
    ) => Promise<unknown>;
    getReport?: (
      identity: AuthenticatedTenantIdentity,
      reportId: string,
    ) => Promise<unknown | null>;
    createCheckout?: (
      identity: AuthenticatedTenantIdentity,
      idempotencyKey: string,
    ) => Promise<{ id: string; url: string }>;
    startDocumentUpload?: (
      identity: AuthenticatedTenantIdentity,
      input: {
        idempotencyKey: string;
        originalSha256: string;
        mediaType: string;
        maximumBytes: number;
        expiresAt?: string;
      },
    ) => Promise<unknown>;
    createDocumentUploadUrl?: (
      identity: AuthenticatedTenantIdentity,
      input: {
        documentId: string;
        expectedVersion: number;
        ciphertextSha256: string;
      },
    ) => Promise<{ uploadUrl: string; expiresInSeconds: number }>;
    completeDocumentUpload?: (
      identity: AuthenticatedTenantIdentity,
      input: {
        documentId: string;
        expectedVersion: number;
        ciphertextSha256: string;
        idempotencyKey: string;
      },
    ) => Promise<unknown>;
    completeManualDocumentExtraction?: (
      identity: AuthenticatedTenantIdentity,
      input: {
        documentId: string;
        workflowId: string;
        expectedWorkflowVersion: number;
        idempotencyKey: string;
        candidates: readonly {
          fieldKey: string;
          value: unknown;
          locator: string;
          sensitivity: string;
          confidence?: number;
        }[];
      },
    ) => Promise<unknown>;
    runAiInterview?: (
      identity: AuthenticatedTenantIdentity,
      input: {
        message: string;
        categories: readonly RecordCategory[];
        expectedConsentVersion: number;
        idempotencyKey: string;
      },
    ) => Promise<unknown>;
  },
): Promise<void> {
  server.setErrorHandler((error, request, reply) => {
    const message = error instanceof Error ? error.message : "unknown error";
    const problem =
      error instanceof ApiProblem
        ? error
        : error instanceof AuthenticationRequiredError
          ? new ApiProblem(
              401,
              "Authentication required",
              "Authentication is required.",
            )
          : error instanceof HouseholdSelectionRequiredError
            ? new ApiProblem(
                409,
                "Household selection required",
                "Select an accessible household.",
              )
            : error instanceof AuthorizationDeniedError
              ? new ApiProblem(403, "Access denied", "Access is denied.")
              : new ApiProblem(
                  message.includes("conflict") ||
                    message.includes("idempotency")
                    ? 409
                    : 500,
                  message.includes("conflict")
                    ? "Version conflict"
                    : "Request failed",
                  "The request could not be completed.",
                );
    return reply.code(problem.status).type("application/problem+json").send({
      type: "about:blank",
      title: problem.title,
      status: problem.status,
      detail: problem.message,
      instance: request.id,
      traceId: request.id,
    });
  });

  server.post("/v1/facts", async (request, reply) => {
    const identity = await dependencies.resolveIdentity(request);
    const body = objectBody(request.body);
    const key = idempotencyKey(request);
    if (!dependencies.encryptFactValue)
      throw new ApiProblem(
        503,
        "Fact encryption unavailable",
        "Fact encryption is not configured.",
      );
    if (!Object.hasOwn(body, "value"))
      throw new ApiProblem(400, "Invalid request", "value is required");
    let plaintext: Buffer;
    try {
      const serialized = JSON.stringify(body.value);
      if (serialized === undefined || Buffer.byteLength(serialized) > 65_536)
        throw new Error("invalid value");
      const prohibited = scanDlp(serialized).filter(
        (finding) => finding !== "prompt-injection",
      );
      if (prohibited.length)
        throw new ApiProblem(
          400,
          "Prohibited content",
          `value contains prohibited ${prohibited.join(", ")}`,
        );
      plaintext = Buffer.from(serialized, "utf8");
    } catch (error) {
      if (error instanceof ApiProblem) throw error;
      throw new ApiProblem(400, "Invalid request", "value is invalid");
    }
    const sourceType = requiredString(body, "sourceType");
    if (
      !["manual", "document", "interview", "professional"].includes(sourceType)
    )
      throw new ApiProblem(400, "Invalid request", "sourceType is invalid");
    const sensitivity = requiredString(body, "sensitivity");
    if (!["standard", "sensitive", "highly-sensitive"].includes(sensitivity))
      throw new ApiProblem(400, "Invalid request", "sensitivity is invalid");
    if (
      body.evidenceIds !== undefined &&
      (!Array.isArray(body.evidenceIds) ||
        !body.evidenceIds.every(
          (item) => typeof item === "string" && uuidPattern.test(item),
        ))
    )
      throw new ApiProblem(400, "Invalid request", "evidenceIds are invalid");
    if (
      body.confidence !== undefined &&
      (typeof body.confidence !== "number" ||
        body.confidence < 0 ||
        body.confidence > 1)
    )
      throw new ApiProblem(400, "Invalid request", "confidence is invalid");
    const fieldKey = requiredString(body, "fieldKey");
    const category = factCategory(fieldKey);
    await dependencies.authorizeIdentity?.(identity, {
      category,
      action: "create",
      purpose: "vault.fact.create",
    });
    let encrypted: {
      id: string;
      ciphertext: Uint8Array;
      keyVersion: number;
    };
    try {
      encrypted = await dependencies.encryptFactValue(identity, {
        fieldKey,
        plaintext,
      });
    } finally {
      plaintext.fill(0);
    }
    const candidate = {
      id: encrypted.id,
      fieldKey,
      ciphertext: encrypted.ciphertext,
      keyVersion: encrypted.keyVersion,
      sourceType,
      sourceId: requiredUuid(body, "sourceId"),
      evidenceIds: (body.evidenceIds ?? []) as string[],
      ...(typeof body.confidence === "number"
        ? { confidence: body.confidence }
        : {}),
      sensitivity,
    };
    const reservation = await dependencies.repository.reserveIdempotency(
      identity,
      key,
      body,
    );
    if (reservation.replay) {
      if (reservation.statusCode === undefined)
        throw new ApiProblem(
          409,
          "Request in progress",
          "the idempotent request is still processing",
        );
      return reply.code(reservation.statusCode).send(reservation.responseBody);
    }
    const created = await dependencies.repository.createCandidateFact(
      identity,
      candidate,
    );
    await dependencies.repository.completeIdempotency(
      identity,
      key,
      201,
      created,
    );
    return reply.code(201).send(created);
  });

  server.post("/v1/documents", async (request, reply) => {
    const identity = await dependencies.resolveIdentity(request);
    const body = objectBody(request.body);
    const key = idempotencyKey(request);
    const originalSha256 = requiredString(body, "originalSha256");
    if (!/^[0-9a-f]{64}$/u.test(originalSha256))
      throw new ApiProblem(
        400,
        "Invalid request",
        "originalSha256 must be a lowercase SHA-256 digest",
      );
    const mediaType = requiredString(body, "mediaType");
    if (
      !["application/pdf", "image/jpeg", "image/png", "image/tiff"].includes(
        mediaType,
      )
    )
      throw new ApiProblem(400, "Invalid request", "mediaType is invalid");
    const maximumBytes = requiredPositiveInteger(body, "maximumBytes");
    if (maximumBytes > 100 * 1024 * 1024)
      throw new ApiProblem(
        400,
        "Invalid request",
        "maximumBytes exceeds the service limit",
      );
    const expiresAtValue = body.expiresAt;
    let expiresAt: string | undefined;
    if (expiresAtValue !== undefined) {
      if (typeof expiresAtValue !== "string")
        throw new ApiProblem(
          400,
          "Invalid request",
          "expiresAt must be an ISO 8601 timestamp",
        );
      const parsedExpiresAt = new Date(expiresAtValue);
      if (
        Number.isNaN(parsedExpiresAt.valueOf()) ||
        !/[zZ]|[+-]\d{2}:\d{2}$/u.test(expiresAtValue)
      )
        throw new ApiProblem(
          400,
          "Invalid request",
          "expiresAt must be an ISO 8601 timestamp with a timezone",
        );
      expiresAt = parsedExpiresAt.toISOString();
    }
    for (const category of allRecordCategories)
      await dependencies.authorizeIdentity?.(identity, {
        category,
        action: "create",
        purpose: "vault.document.create",
      });
    if (!dependencies.startDocumentUpload)
      throw new ApiProblem(
        503,
        "Document upload unavailable",
        "Document uploads are not configured.",
      );
    const started = await dependencies.startDocumentUpload(identity, {
      idempotencyKey: key,
      originalSha256,
      mediaType,
      maximumBytes,
      ...(expiresAt ? { expiresAt } : {}),
    });
    return reply.header("cache-control", "no-store").code(201).send(started);
  });

  server.post<{ Params: { id: string } }>(
    "/v1/documents/:id/upload-url",
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      idempotencyKey(request);
      if (!uuidPattern.test(request.params.id))
        throw new ApiProblem(400, "Invalid request", "document id is invalid");
      const body = objectBody(request.body);
      const ciphertextSha256 = requiredString(body, "ciphertextSha256");
      if (!/^[0-9a-f]{64}$/u.test(ciphertextSha256))
        throw new ApiProblem(
          400,
          "Invalid request",
          "ciphertextSha256 must be a lowercase SHA-256 digest",
        );
      const expectedVersion = Number(request.headers["if-match"]);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        throw new ApiProblem(
          400,
          "Invalid request",
          "a valid if-match version is required",
        );
      for (const category of allRecordCategories)
        await dependencies.authorizeIdentity?.(identity, {
          category,
          action: "create",
          purpose: "vault.document.upload-url",
        });
      if (!dependencies.createDocumentUploadUrl)
        throw new ApiProblem(
          503,
          "Document upload unavailable",
          "Document uploads are not configured.",
        );
      const signed = await dependencies.createDocumentUploadUrl(identity, {
        documentId: request.params.id,
        expectedVersion,
        ciphertextSha256,
      });
      return reply.header("cache-control", "no-store").send(signed);
    },
  );

  server.post("/v1/extractions/manual", async (request, reply) => {
    const identity = await dependencies.resolveIdentity(request);
    const body = objectBody(request.body);
    const key = idempotencyKey(request);
    const documentId = requiredUuid(body, "documentId");
    const workflowId = requiredUuid(body, "workflowId");
    const expectedWorkflowVersion = Number(request.headers["if-match"]);
    if (
      !Number.isSafeInteger(expectedWorkflowVersion) ||
      expectedWorkflowVersion < 1
    )
      throw new ApiProblem(
        400,
        "Invalid request",
        "a valid if-match workflow version is required",
      );
    if (
      !Array.isArray(body.candidates) ||
      body.candidates.length < 1 ||
      body.candidates.length > 50
    )
      throw new ApiProblem(
        400,
        "Invalid request",
        "candidates must contain between 1 and 50 items",
      );
    const candidates = body.candidates.map((candidate, index) => {
      const item = objectBody(candidate);
      const fieldKey = requiredString(item, "fieldKey");
      const category = factCategory(fieldKey);
      const locator = requiredString(item, "locator");
      if (locator.length > 256)
        throw new ApiProblem(
          400,
          "Invalid request",
          `candidates[${index}].locator is too long`,
        );
      const sensitivity = requiredString(item, "sensitivity");
      if (!["standard", "sensitive", "highly-sensitive"].includes(sensitivity))
        throw new ApiProblem(
          400,
          "Invalid request",
          `candidates[${index}].sensitivity is invalid`,
        );
      if (!Object.hasOwn(item, "value"))
        throw new ApiProblem(
          400,
          "Invalid request",
          `candidates[${index}].value is required`,
        );
      const serialized = JSON.stringify(item.value);
      if (serialized === undefined || Buffer.byteLength(serialized) > 65_536)
        throw new ApiProblem(
          400,
          "Invalid request",
          `candidates[${index}].value is invalid`,
        );
      const prohibited = scanDlp(serialized).filter(
        (finding) => finding !== "prompt-injection",
      );
      if (prohibited.length)
        throw new ApiProblem(
          400,
          "Prohibited content",
          `candidates[${index}].value contains prohibited ${prohibited.join(", ")}`,
        );
      if (
        item.confidence !== undefined &&
        (typeof item.confidence !== "number" ||
          item.confidence < 0 ||
          item.confidence > 1)
      )
        throw new ApiProblem(
          400,
          "Invalid request",
          `candidates[${index}].confidence is invalid`,
        );
      return {
        fieldKey,
        category,
        value: item.value,
        locator,
        sensitivity,
        ...(typeof item.confidence === "number"
          ? { confidence: item.confidence }
          : {}),
      };
    });
    for (const candidate of candidates)
      await dependencies.authorizeIdentity?.(identity, {
        category: candidate.category,
        action: "create",
        purpose: "vault.extraction.manual",
      });
    if (!dependencies.completeManualDocumentExtraction)
      throw new ApiProblem(
        503,
        "Manual extraction unavailable",
        "Manual extraction is not configured.",
      );
    const completed = await dependencies.completeManualDocumentExtraction(
      identity,
      {
        documentId,
        workflowId,
        expectedWorkflowVersion,
        idempotencyKey: key,
        candidates: candidates.map(
          ({ category: _category, ...candidate }) => candidate,
        ),
      },
    );
    return reply.code(201).send(completed);
  });

  server.post("/v1/ai-settings/interview", async (request, reply) => {
    const identity = await dependencies.resolveIdentity(request);
    const body = objectBody(request.body);
    const key = idempotencyKey(request);
    const message = requiredString(body, "message");
    if (Buffer.byteLength(message) > 20_000)
      throw new ApiProblem(400, "Invalid request", "message is too large");
    const findings = scanDlp(message);
    if (findings.length)
      throw new ApiProblem(
        400,
        "Prohibited content",
        `message contains prohibited ${findings.join(", ")}`,
      );
    if (
      !Array.isArray(body.categories) ||
      body.categories.length === 0 ||
      !body.categories.every(
        (category) =>
          typeof category === "string" &&
          allRecordCategories.includes(category as RecordCategory),
      )
    )
      throw new ApiProblem(400, "Invalid request", "categories are invalid");
    const categories = [...new Set(body.categories)] as RecordCategory[];
    const expectedConsentVersion = Number(request.headers["if-match"]);
    if (
      !Number.isSafeInteger(expectedConsentVersion) ||
      expectedConsentVersion < 1
    )
      throw new ApiProblem(
        400,
        "Invalid request",
        "a valid if-match consent version is required",
      );
    for (const category of categories)
      await dependencies.authorizeIdentity?.(identity, {
        category,
        action: "read",
        purpose: "vault.ai.interview",
      });
    if (!dependencies.runAiInterview)
      throw new ApiProblem(
        503,
        "AI unavailable",
        "External AI is not configured.",
      );
    try {
      const response = await dependencies.runAiInterview(identity, {
        message,
        categories,
        expectedConsentVersion,
        idempotencyKey: key,
      });
      return reply.header("cache-control", "no-store").send(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("consent"))
        throw new ApiProblem(
          403,
          "AI consent required",
          "Affirmative external AI consent is required.",
        );
      if (message.includes("idempotency"))
        throw new ApiProblem(
          409,
          "Idempotency conflict",
          "The idempotency key was reused with different input.",
        );
      if (message.includes("unavailable"))
        throw new ApiProblem(
          503,
          "AI unavailable",
          "External AI is temporarily unavailable.",
        );
      throw new ApiProblem(
        502,
        "AI response rejected",
        "The external AI response did not pass policy validation.",
      );
    }
  });

  server.post<{ Params: { id: string } }>(
    "/v1/documents/:id/complete",
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      const key = idempotencyKey(request);
      if (!uuidPattern.test(request.params.id))
        throw new ApiProblem(400, "Invalid request", "document id is invalid");
      const body = objectBody(request.body);
      const ciphertextSha256 = requiredString(body, "ciphertextSha256");
      if (!/^[0-9a-f]{64}$/u.test(ciphertextSha256))
        throw new ApiProblem(
          400,
          "Invalid request",
          "ciphertextSha256 must be a lowercase SHA-256 digest",
        );
      const expectedVersion = Number(request.headers["if-match"]);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        throw new ApiProblem(
          400,
          "Invalid request",
          "a valid if-match version is required",
        );
      for (const category of allRecordCategories)
        await dependencies.authorizeIdentity?.(identity, {
          category,
          action: "create",
          purpose: "vault.document.complete",
        });
      if (!dependencies.completeDocumentUpload)
        throw new ApiProblem(
          503,
          "Document upload unavailable",
          "Document uploads are not configured.",
        );
      const completed = await dependencies.completeDocumentUpload(identity, {
        documentId: request.params.id,
        expectedVersion,
        ciphertextSha256,
        idempotencyKey: key,
      });
      return reply.code(202).send(completed);
    },
  );

  server.post<{ Params: { id: string } }>(
    "/v1/facts/:id/confirm",
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      const fieldKey = await dependencies.repository.getFactFieldKey(
        identity,
        request.params.id,
      );
      await dependencies.authorizeIdentity?.(identity, {
        category: factCategory(fieldKey),
        action: "approve",
        purpose: "vault.fact.confirm",
      });
      const key = idempotencyKey(request);
      const expectedVersion = Number(request.headers["if-match"]);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        throw new ApiProblem(
          400,
          "Invalid request",
          "a valid if-match version is required",
        );
      const reservation = await dependencies.repository.reserveIdempotency(
        identity,
        key,
        { factId: request.params.id, expectedVersion },
      );
      if (reservation.replay) {
        if (reservation.statusCode === undefined)
          throw new ApiProblem(
            409,
            "Request in progress",
            "the idempotent request is still processing",
          );
        return reply
          .code(reservation.statusCode)
          .send(reservation.responseBody);
      }
      const confirmed = await dependencies.repository.confirmFact(
        identity,
        request.params.id,
        expectedVersion,
        new Date().toISOString(),
      );
      await dependencies.repository.completeIdempotency(
        identity,
        key,
        200,
        confirmed,
      );
      return reply.send(confirmed);
    },
  );

  server.post("/v1/emergency-access", async (request, reply) => {
    const identity = await dependencies.resolveIdentity(request);
    const body = objectBody(request.body);
    const recipientMembershipId = requiredUuid(body, "recipientMembershipId");
    if (recipientMembershipId !== identity.membershipId)
      throw new ApiProblem(
        403,
        "Access denied",
        "Emergency access may be requested only for the active membership.",
      );
    if (
      !Array.isArray(body.categories) ||
      body.categories.length === 0 ||
      !body.categories.every(
        (category) =>
          typeof category === "string" &&
          allRecordCategories.includes(category as RecordCategory),
      )
    )
      throw new ApiProblem(400, "Invalid request", "categories are invalid");
    const categories = [...new Set(body.categories as RecordCategory[])].sort();
    const reason = requiredString(body, "reason");
    if (Buffer.byteLength(reason) > 2_000)
      throw new ApiProblem(400, "Invalid request", "reason is too large");
    const findings = scanDlp(reason);
    if (findings.length)
      throw new ApiProblem(
        400,
        "Prohibited content",
        `reason contains prohibited ${findings.join(", ")}`,
      );
    for (const category of categories)
      await dependencies.authorizeIdentity?.(identity, {
        category,
        action: "create",
        purpose: "vault.emergency-access.request",
      });
    if (!dependencies.encryptEmergencyReason)
      throw new ApiProblem(
        503,
        "Emergency access unavailable",
        "Emergency access encryption is not configured.",
      );
    const key = idempotencyKey(request);
    const requestShape = { recipientMembershipId, categories, reason };
    const reservation = await dependencies.repository.reserveIdempotency(
      identity,
      key,
      requestShape,
    );
    if (reservation.replay)
      return reply
        .code(reservation.statusCode ?? 409)
        .send(reservation.responseBody ?? { status: "processing" });
    const plaintext = Buffer.from(reason, "utf8");
    try {
      const encrypted = await dependencies.encryptEmergencyReason(
        identity,
        plaintext,
      );
      const created =
        await dependencies.repository.createEmergencyAccessRequest(identity, {
          id: encrypted.id,
          recipientMembershipId,
          categories,
          reasonEncrypted: encrypted.ciphertext,
          keyVersion: encrypted.keyVersion,
          requestedAt: new Date().toISOString(),
        });
      await dependencies.repository.completeIdempotency(
        identity,
        key,
        201,
        created,
      );
      return reply.header("cache-control", "no-store").code(201).send(created);
    } finally {
      plaintext.fill(0);
    }
  });

  server.post<{ Params: { id: string } }>(
    "/v1/emergency-access/:id/decide",
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      if (!uuidPattern.test(request.params.id))
        throw new ApiProblem(
          400,
          "Invalid request",
          "emergency request id is invalid",
        );
      const body = objectBody(request.body);
      const decision = requiredString(body, "decision");
      if (decision !== "deny" && decision !== "delay")
        throw new ApiProblem(
          400,
          "Invalid request",
          "decision must be deny or delay",
        );
      const delayHours =
        decision === "delay" ? requiredPositiveInteger(body, "delayHours") : 0;
      if (delayHours > 168)
        throw new ApiProblem(
          400,
          "Invalid request",
          "delayHours exceeds seven days",
        );
      const expectedVersion = Number(request.headers["if-match"]);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        throw new ApiProblem(
          400,
          "Invalid request",
          "a valid if-match version is required",
        );
      const categories =
        await dependencies.repository.getEmergencyAccessCategories(
          identity,
          request.params.id,
        );
      for (const category of categories)
        await dependencies.authorizeIdentity?.(identity, {
          category: category as RecordCategory,
          action: "approve",
          purpose: "vault.emergency-access.decide",
        });
      const key = idempotencyKey(request);
      const requestShape = {
        requestId: request.params.id,
        expectedVersion,
        decision,
        delayHours,
      };
      const reservation = await dependencies.repository.reserveIdempotency(
        identity,
        key,
        requestShape,
      );
      if (reservation.replay)
        return reply
          .code(reservation.statusCode ?? 409)
          .send(reservation.responseBody ?? { status: "processing" });
      const decisionAt = new Date();
      try {
        const decided = await dependencies.repository.decideEmergencyAccess(
          identity,
          {
            requestId: request.params.id,
            expectedVersion,
            decision,
            decisionAt: decisionAt.toISOString(),
            ...(decision === "delay"
              ? {
                  releaseAfter: new Date(
                    decisionAt.getTime() + delayHours * 60 * 60 * 1_000,
                  ).toISOString(),
                }
              : {}),
          },
        );
        await dependencies.repository.completeIdempotency(
          identity,
          key,
          200,
          decided,
        );
        return reply.header("cache-control", "no-store").send(decided);
      } catch (error) {
        if (error instanceof Error && error.message.includes("conflict"))
          throw new ApiProblem(
            409,
            "Emergency access conflict",
            "The emergency request changed or cannot be decided.",
          );
        throw error;
      }
    },
  );

  server.post<{ Params: { id: string } }>(
    "/v1/emergency-access/:id/release",
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      if (!uuidPattern.test(request.params.id))
        throw new ApiProblem(
          400,
          "Invalid request",
          "emergency request id is invalid",
        );
      const expectedVersion = Number(request.headers["if-match"]);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        throw new ApiProblem(
          400,
          "Invalid request",
          "a valid if-match version is required",
        );
      const categories =
        await dependencies.repository.getEmergencyAccessCategories(
          identity,
          request.params.id,
        );
      for (const category of categories)
        await dependencies.authorizeIdentity?.(identity, {
          category: category as RecordCategory,
          action: "approve",
          purpose: "vault.emergency-access.release",
        });
      const key = idempotencyKey(request);
      const requestShape = { requestId: request.params.id, expectedVersion };
      const reservation = await dependencies.repository.reserveIdempotency(
        identity,
        key,
        requestShape,
      );
      if (reservation.replay)
        return reply
          .code(reservation.statusCode ?? 409)
          .send(reservation.responseBody ?? { status: "processing" });
      try {
        const released = await dependencies.repository.releaseEmergencyAccess(
          identity,
          {
            requestId: request.params.id,
            expectedVersion,
            releasedAt: new Date().toISOString(),
          },
        );
        await dependencies.repository.completeIdempotency(
          identity,
          key,
          200,
          released,
        );
        return reply.header("cache-control", "no-store").send(released);
      } catch (error) {
        if (error instanceof Error && error.message.includes("conflict"))
          throw new ApiProblem(
            409,
            "Emergency access conflict",
            "The release delay remains active or the request changed.",
          );
        throw error;
      }
    },
  );

  server.post("/v1/consents", async (request, reply) => {
    const identity = await dependencies.resolveIdentity(request);
    const body = objectBody(request.body);
    await dependencies.authorizeIdentity?.(identity, {
      category: "household-instructions",
      action: "approve",
      purpose: "vault.consent.record",
    });
    const purpose = requiredString(body, "purpose");
    if (
      ![
        "external-ai",
        "sensitive-data",
        "document-processing",
        "transactional-email",
        "terms",
        "privacy-policy",
      ].includes(purpose)
    )
      throw new ApiProblem(400, "Invalid request", "purpose is invalid");
    const key = idempotencyKey(request);
    const reservation = await dependencies.repository.reserveIdempotency(
      identity,
      key,
      body,
    );
    if (reservation.replay)
      return reply
        .code(reservation.statusCode ?? 409)
        .send(reservation.responseBody ?? { status: "processing" });
    const consent = await dependencies.repository.recordConsent(identity, {
      personId: requiredUuid(body, "personId"),
      purpose,
      policyVersion: requiredString(body, "policyVersion"),
      grantedAt: new Date().toISOString(),
    });
    await dependencies.repository.completeIdempotency(
      identity,
      key,
      201,
      consent,
    );
    return reply.code(201).send(consent);
  });

  server.post<{ Params: { id: string } }>(
    "/v1/consents/:id/withdraw",
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      await dependencies.authorizeIdentity?.(identity, {
        category: "household-instructions",
        action: "approve",
        purpose: "vault.consent.withdraw",
      });
      if (!uuidPattern.test(request.params.id))
        throw new ApiProblem(400, "Invalid request", "consent id is invalid");
      const expectedVersion = Number(request.headers["if-match"]);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        throw new ApiProblem(
          400,
          "Invalid request",
          "a valid if-match version is required",
        );
      const key = idempotencyKey(request);
      const requestShape = {
        consentId: request.params.id,
        expectedVersion,
      };
      const reservation = await dependencies.repository.reserveIdempotency(
        identity,
        key,
        requestShape,
      );
      if (reservation.replay)
        return reply
          .code(reservation.statusCode ?? 409)
          .send(reservation.responseBody ?? { status: "processing" });
      const withdrawn = await dependencies.repository.withdrawConsent(
        identity,
        request.params.id,
        expectedVersion,
        new Date().toISOString(),
      );
      await dependencies.repository.completeIdempotency(
        identity,
        key,
        200,
        withdrawn,
      );
      return reply.send(withdrawn);
    },
  );

  server.post("/v1/privacy-requests", async (request, reply) => {
    const identity = await dependencies.resolveIdentity(request);
    const body = objectBody(request.body);
    await dependencies.authorizeIdentity?.(identity, {
      category: "household-instructions",
      action: "create",
      purpose: "vault.privacy-request.create",
    });
    const kind = requiredString(body, "kind");
    if (
      !["access", "correction", "export", "deletion", "appeal"].includes(kind)
    )
      throw new ApiProblem(
        400,
        "Invalid request",
        "privacy request kind is invalid",
      );
    const personId = requiredUuid(body, "personId");
    if (personId !== identity.actorId)
      throw new ApiProblem(
        403,
        "Forbidden",
        "privacy requests must be submitted by the data subject",
      );
    const result = await dependencies.repository.startPrivacyRequest(identity, {
      personId,
      kind: kind as "access" | "correction" | "export" | "deletion" | "appeal",
      idempotencyKey: idempotencyKey(request),
      requestedAt: new Date().toISOString(),
    });
    return reply.code(202).send(result);
  });

  server.post(
    "/v1/privacy-requests/:requestId/confirm-deletion",
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      if (!dependencies.confirmPrivacyDeletion)
        throw new ApiProblem(
          503,
          "Deletion unavailable",
          "The deletion workflow is not configured.",
        );
      await dependencies.authorizeIdentity?.(identity, {
        category: "household-instructions",
        action: "delete",
        purpose: "vault.privacy-request.confirm-deletion",
      });
      const parameters = request.params as { requestId?: string };
      const requestId = parameters.requestId;
      if (!requestId || !uuidPattern.test(requestId))
        throw new ApiProblem(
          400,
          "Invalid request",
          "requestId must be a UUID",
        );
      const expectedVersion = Number(request.headers["if-match"]);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        throw new ApiProblem(
          400,
          "Invalid request",
          "a valid if-match version is required",
        );
      const result = await dependencies.confirmPrivacyDeletion(identity, {
        requestId,
        expectedVersion,
        idempotencyKey: idempotencyKey(request),
      });
      return reply.code(202).send(result);
    },
  );

  server.post(
    "/v1/privacy-requests/:requestId/cancel-deletion",
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      if (!dependencies.cancelPrivacyDeletion)
        throw new ApiProblem(
          503,
          "Deletion cancellation unavailable",
          "The deletion workflow is not configured.",
        );
      await dependencies.authorizeIdentity?.(identity, {
        category: "household-instructions",
        action: "delete",
        purpose: "vault.privacy-request.cancel-deletion",
      });
      const parameters = request.params as { requestId?: string };
      const requestId = parameters.requestId;
      if (!requestId || !uuidPattern.test(requestId))
        throw new ApiProblem(
          400,
          "Invalid request",
          "requestId must be a UUID",
        );
      const expectedVersion = Number(request.headers["if-match"]);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        throw new ApiProblem(
          400,
          "Invalid request",
          "a valid if-match version is required",
        );
      const result = await dependencies.cancelPrivacyDeletion(identity, {
        requestId,
        expectedVersion,
        idempotencyKey: idempotencyKey(request),
      });
      return reply.send(result);
    },
  );

  server.post("/v1/exports", async (request, reply) => {
    const identity = await dependencies.resolveIdentity(request);
    if (!dependencies.startPortableExport)
      throw new ApiProblem(
        503,
        "Export unavailable",
        "The export workflow is not configured.",
      );
    for (const category of allRecordCategories)
      await dependencies.authorizeIdentity?.(identity, {
        category,
        action: "export",
        purpose: "vault.export.create",
      });
    const body = objectBody(request.body);
    const encodedKey = requiredString(body, "exportKeyBase64");
    if (!/^[A-Za-z0-9+/]{43}=$/u.test(encodedKey))
      throw new ApiProblem(
        400,
        "Invalid request",
        "exportKeyBase64 must encode exactly 32 bytes",
      );
    const exportKey = Buffer.from(encodedKey, "base64");
    if (exportKey.byteLength !== 32)
      throw new ApiProblem(
        400,
        "Invalid request",
        "exportKeyBase64 must encode exactly 32 bytes",
      );
    try {
      const started = await dependencies.startPortableExport(identity, {
        idempotencyKey: idempotencyKey(request),
        exportKey,
      });
      return reply.code(202).send(started);
    } finally {
      exportKey.fill(0);
    }
  });

  server.get<{ Params: { id: string } }>(
    "/v1/reports/:id",
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      if (!uuidPattern.test(request.params.id))
        throw new ApiProblem(400, "Invalid request", "report id is invalid");
      if (!dependencies.getReport)
        throw new ApiProblem(
          503,
          "Report unavailable",
          "Report retrieval is not configured.",
        );
      for (const category of allRecordCategories)
        await dependencies.authorizeIdentity?.(identity, {
          category,
          action: "read",
          purpose: "vault.report.read",
        });
      const report = await dependencies.getReport(identity, request.params.id);
      if (!report)
        throw new ApiProblem(404, "Report not found", "Report not found.");
      return reply.header("cache-control", "no-store").send(report);
    },
  );

  server.post("/v1/reports", async (request, reply) => {
    const identity = await dependencies.resolveIdentity(request);
    if (!dependencies.createReport)
      throw new ApiProblem(
        503,
        "Report unavailable",
        "Report generation is not configured.",
      );
    for (const category of allRecordCategories)
      await dependencies.authorizeIdentity?.(identity, {
        category,
        action: "read",
        purpose: "vault.report.create",
      });
    const body = objectBody(request.body);
    const kind = requiredString(body, "kind");
    if (
      ![
        "life-inventory",
        "family-emergency-guide",
        "executor-preparation-packet",
        "beneficiary-review-checklist",
        "document-gap-report",
        "household-continuity-guide",
        "annual-review",
      ].includes(kind)
    )
      throw new ApiProblem(400, "Invalid request", "report kind is invalid");
    const key = idempotencyKey(request);
    const reservation = await dependencies.repository.reserveIdempotency(
      identity,
      key,
      { kind },
    );
    if (reservation.replay)
      return reply
        .code(reservation.statusCode ?? 409)
        .send(reservation.responseBody ?? { status: "processing" });
    const report = await dependencies.createReport(
      identity,
      kind as ReportKind,
      key,
    );
    await dependencies.repository.completeIdempotency(
      identity,
      key,
      202,
      report,
    );
    return reply.code(202).send(report);
  });

  server.post("/v1/billing/checkout", async (request, reply) => {
    const identity = await dependencies.resolveIdentity(request);
    if (!dependencies.createCheckout)
      throw new ApiProblem(
        503,
        "Billing unavailable",
        "Billing checkout is not configured.",
      );
    await dependencies.authorizeIdentity?.(identity, {
      category: "household-instructions",
      action: "approve",
      purpose: "vault.billing.checkout",
    });
    try {
      return reply
        .code(201)
        .send(
          await dependencies.createCheckout(identity, idempotencyKey(request)),
        );
    } catch {
      throw new ApiProblem(
        503,
        "Billing unavailable",
        "Billing checkout could not be created.",
      );
    }
  });
}
