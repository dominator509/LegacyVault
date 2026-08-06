import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  type AuthenticatedAccountIdentity,
  type AuthenticatedTenantIdentity,
  HouseholdSelectionRequiredError,
} from "@legacy/auth";
import type { HouseholdMembershipSummary } from "@legacy/database/repository";
import { scanDlp } from "@legacy/ai-gateway";
import { allRecordCategories } from "@legacy/domain";
import type { Role } from "@legacy/domain";
import {
  creationWriteHeaderSchema,
  optimisticWriteHeaderSchema,
  standardProblemResponses,
} from "../openapi.js";
import type { IdentityAuthorizer, IdentityResolver } from "./vault.js";

export type AccountResolver = (
  request: FastifyRequest,
) => Promise<AuthenticatedAccountIdentity>;

class HouseholdApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    message: string,
  ) {
    super(message);
  }
}

function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HouseholdApiProblem(
      400,
      "Invalid request",
      "request body must be an object",
    );
  return value as Record<string, unknown>;
}

function boundedName(
  body: Record<string, unknown>,
  field: string,
  maximum: number,
): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length < 1)
    throw new HouseholdApiProblem(
      400,
      "Invalid request",
      `${field} is required`,
    );
  const normalized = value.trim();
  if (
    normalized.length > maximum ||
    Buffer.byteLength(normalized) > maximum * 4
  )
    throw new HouseholdApiProblem(
      400,
      "Invalid request",
      `${field} is too large`,
    );
  const findings = scanDlp(normalized);
  if (findings.length)
    throw new HouseholdApiProblem(
      400,
      "Prohibited content",
      `${field} contains prohibited content`,
    );
  return normalized;
}

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  if (
    typeof value !== "string" ||
    value.length < 16 ||
    value.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/u.test(value)
  )
    throw new HouseholdApiProblem(
      400,
      "Invalid request",
      "a valid idempotency-key header is required",
    );
  return value;
}

function positiveVersion(request: FastifyRequest): number {
  const version = Number(request.headers["if-match"]);
  if (!Number.isSafeInteger(version) || version < 1)
    throw new HouseholdApiProblem(
      400,
      "Invalid request",
      "a valid positive if-match version is required",
    );
  return version;
}

function invitationEmail(body: Record<string, unknown>): string {
  const value = body.email;
  if (typeof value !== "string")
    throw new HouseholdApiProblem(400, "Invalid request", "email is required");
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)
  )
    throw new HouseholdApiProblem(400, "Invalid request", "email is invalid");
  return normalized;
}

const invitationalRoles = [
  "CoOwner",
  "Editor",
  "FamilyHelper",
  "ProfessionalAdvisor",
  "ReadOnlyViewer",
  "EmergencyRecipient",
] as const satisfies readonly Role[];

const idPathSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
} as const;

export async function registerHouseholdRoutes(
  server: FastifyInstance,
  dependencies: {
    resolveAccount: AccountResolver;
    resolveIdentity: IdentityResolver;
    authorizeIdentity?: IdentityAuthorizer;
    createHousehold: (
      account: AuthenticatedAccountIdentity,
      input: {
        idempotencyKey: string;
        expectedVersion: 0;
        organizationName: string;
        householdName: string;
        ownerDisplayName: string;
      },
    ) => Promise<unknown>;
    listHouseholds: (
      account: AuthenticatedAccountIdentity,
    ) => Promise<HouseholdMembershipSummary[]>;
    listMembers: (
      identity: AuthenticatedTenantIdentity,
    ) => Promise<readonly unknown[]>;
    createInvitation: (
      identity: AuthenticatedTenantIdentity,
      input: {
        email: string;
        role: (typeof invitationalRoles)[number];
        expectedHouseholdVersion: number;
        idempotencyKey: string;
      },
    ) => Promise<unknown>;
    acceptInvitation: (
      account: AuthenticatedAccountIdentity,
      input: {
        token: string;
        displayName: string;
        expectedInvitationVersion: number;
        idempotencyKey: string;
      },
    ) => Promise<unknown>;
    revokeInvitation: (
      identity: AuthenticatedTenantIdentity,
      input: {
        invitationId: string;
        expectedVersion: number;
        idempotencyKey: string;
      },
    ) => Promise<unknown>;
    updateMemberRole: (
      identity: AuthenticatedTenantIdentity,
      input: {
        membershipId: string;
        role: (typeof invitationalRoles)[number];
        expectedVersion: number;
        idempotencyKey: string;
      },
    ) => Promise<unknown>;
  },
): Promise<void> {
  server.setErrorHandler((error, request, reply) => {
    const schemaValidationFailed =
      typeof error === "object" && error !== null && "validation" in error;
    const clientRequestFailed =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 500;
    const problem =
      error instanceof HouseholdApiProblem
        ? error
        : schemaValidationFailed
          ? new HouseholdApiProblem(
              400,
              "Invalid request",
              "The request does not match the API schema.",
            )
          : clientRequestFailed
            ? new HouseholdApiProblem(
                error.statusCode as number,
                "Invalid request",
                "The request could not be parsed.",
              )
            : error instanceof AuthenticationRequiredError
              ? new HouseholdApiProblem(
                  401,
                  "Authentication required",
                  "A verified account session is required.",
                )
              : error instanceof HouseholdSelectionRequiredError
                ? new HouseholdApiProblem(
                    409,
                    "Household selection required",
                    "Select an accessible household.",
                  )
                : error instanceof AuthorizationDeniedError
                  ? new HouseholdApiProblem(
                      403,
                      "Access denied",
                      "Access is denied.",
                    )
                  : error instanceof Error &&
                      error.message.includes(
                        "membership invitation unavailable",
                      )
                    ? new HouseholdApiProblem(
                        404,
                        "Invitation unavailable",
                        "The invitation is invalid, expired, already used, or not addressed to this account.",
                      )
                    : new HouseholdApiProblem(
                        error instanceof Error &&
                          (error.message.includes("conflict") ||
                            error.message.includes("idempotency"))
                          ? 409
                          : 500,
                        error instanceof Error &&
                          error.message.includes("conflict")
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

  server.get(
    "/v1/households",
    {
      schema: {
        tags: ["households"],
        summary: "List households accessible to the authenticated account",
        security: [{ sessionCookie: [] }],
        response: {
          200: {
            description: "Authenticated account household memberships",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["households"],
                  properties: {
                    households: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: [
                          "id",
                          "organizationId",
                          "name",
                          "version",
                          "membershipId",
                          "personId",
                          "role",
                        ],
                        properties: {
                          id: { type: "string", format: "uuid" },
                          organizationId: {
                            type: "string",
                            format: "uuid",
                          },
                          name: { type: "string" },
                          version: { type: "integer", minimum: 1 },
                          membershipId: {
                            type: "string",
                            format: "uuid",
                          },
                          personId: { type: "string", format: "uuid" },
                          role: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          ...standardProblemResponses,
        },
      },
    },
    async (request, reply) => {
      const account = await dependencies.resolveAccount(request);
      return reply.header("cache-control", "no-store").send({
        households: await dependencies.listHouseholds(account),
      });
    },
  );

  server.post(
    "/v1/households",
    {
      schema: {
        tags: ["households"],
        summary: "Create an initial encrypted household and owner membership",
        security: [{ sessionCookie: [] }],
        headers: creationWriteHeaderSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["organizationName", "householdName", "ownerDisplayName"],
          properties: {
            organizationName: { type: "string", minLength: 1, maxLength: 120 },
            householdName: { type: "string", minLength: 1, maxLength: 120 },
            ownerDisplayName: { type: "string", minLength: 1, maxLength: 160 },
          },
        },
        response: {
          201: {
            description: "Household and owner membership created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["household", "membership"],
                  properties: {
                    household: {
                      type: "object",
                      additionalProperties: false,
                      required: ["id", "name", "version"],
                      properties: {
                        id: { type: "string", format: "uuid" },
                        name: { type: "string" },
                        version: { type: "integer", minimum: 1 },
                      },
                    },
                    membership: {
                      type: "object",
                      additionalProperties: false,
                      required: ["id", "role", "version"],
                      properties: {
                        id: { type: "string", format: "uuid" },
                        role: { type: "string", const: "Owner" },
                        version: { type: "integer", minimum: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
          ...standardProblemResponses,
        },
      },
    },
    async (request, reply) => {
      const account = await dependencies.resolveAccount(request);
      const body = bodyObject(request.body);
      return reply.code(201).send(
        await dependencies.createHousehold(account, {
          idempotencyKey: idempotencyKey(request),
          expectedVersion: 0,
          organizationName: boundedName(body, "organizationName", 120),
          householdName: boundedName(body, "householdName", 120),
          ownerDisplayName: boundedName(body, "ownerDisplayName", 160),
        }),
      );
    },
  );

  server.get(
    "/v1/members",
    {
      schema: {
        tags: ["members"],
        summary: "List authorized household member metadata",
        security: [{ sessionCookie: [] }],
        response: standardProblemResponses,
      },
    },
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      for (const category of allRecordCategories)
        await dependencies.authorizeIdentity?.(identity, {
          category,
          action: "approve",
          purpose: "vault.member.list",
        });
      return reply.header("cache-control", "no-store").send({
        members: await dependencies.listMembers(identity),
      });
    },
  );

  server.post(
    "/v1/members/invitations",
    {
      schema: {
        tags: ["members"],
        summary: "Invite a bounded household member by verified email",
        security: [{ sessionCookie: [] }],
        headers: optimisticWriteHeaderSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["email", "role"],
          properties: {
            email: { type: "string", format: "email", maxLength: 254 },
            role: { type: "string", enum: invitationalRoles },
          },
        },
        response: {
          201: {
            description: "Invitation persisted and transactional email sent",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["invitation", "householdVersion"],
                  properties: {
                    invitation: {
                      type: "object",
                      additionalProperties: false,
                      required: ["id", "role", "expiresAt", "version"],
                      properties: {
                        id: { type: "string", format: "uuid" },
                        role: { type: "string", enum: invitationalRoles },
                        expiresAt: { type: "string", format: "date-time" },
                        version: { type: "integer", minimum: 1 },
                      },
                    },
                    householdVersion: { type: "integer", minimum: 2 },
                  },
                },
              },
            },
          },
          ...standardProblemResponses,
        },
      },
    },
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      for (const category of allRecordCategories)
        await dependencies.authorizeIdentity?.(identity, {
          category,
          action: "approve",
          purpose: "vault.member.invite",
        });
      const body = bodyObject(request.body);
      const role = body.role;
      if (
        typeof role !== "string" ||
        !invitationalRoles.includes(role as (typeof invitationalRoles)[number])
      )
        throw new HouseholdApiProblem(
          400,
          "Invalid request",
          "role is not invitational",
        );
      return reply.code(201).send(
        await dependencies.createInvitation(identity, {
          email: invitationEmail(body),
          role: role as (typeof invitationalRoles)[number],
          expectedHouseholdVersion: positiveVersion(request),
          idempotencyKey: idempotencyKey(request),
        }),
      );
    },
  );

  server.post(
    "/v1/members/invitations/:token/accept",
    {
      schema: {
        tags: ["members"],
        summary: "Accept a token-bound household invitation",
        security: [{ sessionCookie: [] }],
        headers: optimisticWriteHeaderSchema,
        params: {
          type: "object",
          additionalProperties: false,
          required: ["token"],
          properties: {
            token: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
          },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["displayName"],
          properties: {
            displayName: { type: "string", minLength: 1, maxLength: 160 },
          },
        },
        response: {
          200: {
            description: "Invitation accepted and membership activated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["household", "membership"],
                  properties: {
                    household: {
                      type: "object",
                      additionalProperties: false,
                      required: ["id", "name", "version"],
                      properties: {
                        id: { type: "string", format: "uuid" },
                        name: { type: "string" },
                        version: { type: "integer", minimum: 1 },
                      },
                    },
                    membership: {
                      type: "object",
                      additionalProperties: false,
                      required: ["id", "role", "version"],
                      properties: {
                        id: { type: "string", format: "uuid" },
                        role: { type: "string", enum: invitationalRoles },
                        version: { type: "integer", minimum: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
          ...standardProblemResponses,
        },
      },
    },
    async (request, reply) => {
      const account = await dependencies.resolveAccount(request);
      const body = bodyObject(request.body);
      const parameters = request.params as { token?: string };
      const token = parameters.token;
      if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token))
        throw new HouseholdApiProblem(
          400,
          "Invalid request",
          "invitation token is invalid",
        );
      return reply.send(
        await dependencies.acceptInvitation(account, {
          token,
          displayName: boundedName(body, "displayName", 160),
          expectedInvitationVersion: positiveVersion(request),
          idempotencyKey: idempotencyKey(request),
        }),
      );
    },
  );

  server.post(
    "/v1/members/invitations/:id/revoke",
    {
      schema: {
        tags: ["members"],
        summary: "Revoke an unused household invitation",
        security: [{ sessionCookie: [] }],
        headers: optimisticWriteHeaderSchema,
        params: idPathSchema,
        response: {
          200: {
            description: "Invitation revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["invitation", "householdVersion"],
                  properties: {
                    invitation: {
                      type: "object",
                      additionalProperties: false,
                      required: ["id", "status", "version"],
                      properties: {
                        id: { type: "string", format: "uuid" },
                        status: { type: "string", const: "revoked" },
                        version: { type: "integer", minimum: 2 },
                      },
                    },
                    householdVersion: { type: "integer", minimum: 2 },
                  },
                },
              },
            },
          },
          ...standardProblemResponses,
        },
      },
    },
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      for (const category of allRecordCategories)
        await dependencies.authorizeIdentity?.(identity, {
          category,
          action: "approve",
          purpose: "vault.member.invitation.revoke",
        });
      const { id } = request.params as { id: string };
      return reply.send(
        await dependencies.revokeInvitation(identity, {
          invitationId: id,
          expectedVersion: positiveVersion(request),
          idempotencyKey: idempotencyKey(request),
        }),
      );
    },
  );

  server.post(
    "/v1/members/:id/role",
    {
      schema: {
        tags: ["members"],
        summary: "Change a non-owner household member role",
        security: [{ sessionCookie: [] }],
        headers: optimisticWriteHeaderSchema,
        params: idPathSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["role"],
          properties: { role: { type: "string", enum: invitationalRoles } },
        },
        response: {
          200: {
            description: "Member role changed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["membership", "householdVersion"],
                  properties: {
                    membership: {
                      type: "object",
                      additionalProperties: false,
                      required: ["id", "role", "version"],
                      properties: {
                        id: { type: "string", format: "uuid" },
                        role: { type: "string", enum: invitationalRoles },
                        version: { type: "integer", minimum: 2 },
                      },
                    },
                    householdVersion: { type: "integer", minimum: 2 },
                  },
                },
              },
            },
          },
          ...standardProblemResponses,
        },
      },
    },
    async (request, reply) => {
      const identity = await dependencies.resolveIdentity(request);
      for (const category of allRecordCategories)
        await dependencies.authorizeIdentity?.(identity, {
          category,
          action: "approve",
          purpose: "vault.member.role.update",
        });
      const body = bodyObject(request.body);
      const role = body.role;
      if (
        typeof role !== "string" ||
        !invitationalRoles.includes(role as (typeof invitationalRoles)[number])
      )
        throw new HouseholdApiProblem(
          400,
          "Invalid request",
          "role is not assignable",
        );
      const { id } = request.params as { id: string };
      return reply.send(
        await dependencies.updateMemberRole(identity, {
          membershipId: id,
          role: role as (typeof invitationalRoles)[number],
          expectedVersion: positiveVersion(request),
          idempotencyKey: idempotencyKey(request),
        }),
      );
    },
  );
}
