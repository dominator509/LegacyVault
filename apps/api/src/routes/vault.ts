import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  TenantContext,
  VaultRepository,
} from "@legacy/database/repository";

export type IdentityResolver = (
  request: FastifyRequest,
) => Promise<TenantContext>;

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

export async function registerVaultRoutes(
  server: FastifyInstance,
  dependencies: {
    repository: VaultRepository;
    resolveIdentity: IdentityResolver;
  },
): Promise<void> {
  server.setErrorHandler((error, request, reply) => {
    const message = error instanceof Error ? error.message : "unknown error";
    const problem =
      error instanceof ApiProblem
        ? error
        : new ApiProblem(
            message.includes("conflict") || message.includes("idempotency")
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
    const ciphertextBase64 = requiredString(body, "ciphertextBase64");
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
        ciphertextBase64,
      )
    )
      throw new ApiProblem(
        400,
        "Invalid request",
        "ciphertextBase64 is invalid",
      );
    const ciphertext = Buffer.from(ciphertextBase64, "base64");
    if (ciphertext.length < 17)
      throw new ApiProblem(
        400,
        "Invalid request",
        "encrypted fact envelope is invalid",
      );
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
    const candidate = {
      fieldKey: requiredString(body, "fieldKey"),
      ciphertext,
      keyVersion: requiredPositiveInteger(body, "keyVersion"),
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

  server.post<{ Params: { id: string } }>(
    "/v1/facts/:id/confirm",
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
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

  server.post("/v1/consents", async (request, reply) => {
    const identity = await dependencies.resolveIdentity(request);
    const body = objectBody(request.body);
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
      personId: requiredString(body, "personId"),
      purpose: requiredString(body, "purpose"),
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

  server.post("/v1/privacy-requests", async (request, reply) => {
    const identity = await dependencies.resolveIdentity(request);
    const body = objectBody(request.body);
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
    const result = await dependencies.repository.startPrivacyRequest(identity, {
      personId,
      kind: kind as "access" | "correction" | "export" | "deletion" | "appeal",
      idempotencyKey: idempotencyKey(request),
      requestedAt: new Date().toISOString(),
    });
    return reply.code(202).send(result);
  });
}
