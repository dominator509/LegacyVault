export const problemDetailsSchema = {
  $id: "ProblemDetails",
  type: "object",
  additionalProperties: false,
  required: ["type", "title", "status"],
  properties: {
    type: { type: "string", format: "uri" },
    title: { type: "string", minLength: 1 },
    status: { type: "integer", minimum: 400, maximum: 599 },
    detail: { type: "string" },
    instance: { type: "string" },
    traceId: { type: "string" },
    errors: {
      type: "object",
      additionalProperties: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
} as const;

export const problemContent = {
  "application/problem+json": {
    schema: { $ref: "ProblemDetails#" },
  },
} as const;

export const standardProblemResponses = {
  400: { description: "Invalid request", content: problemContent },
  401: { description: "Authentication required", content: problemContent },
  403: { description: "Access denied", content: problemContent },
  404: { description: "Resource not found", content: problemContent },
  409: { description: "State or version conflict", content: problemContent },
  500: { description: "Request failed", content: problemContent },
  503: { description: "Dependency unavailable", content: problemContent },
} as const;
