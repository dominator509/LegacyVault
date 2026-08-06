export interface ProblemDetails {
  title?: string;
  detail?: string;
  status?: number;
  traceId?: string;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly traceId?: string,
  ) {
    super(message);
  }
}

function activeHousehold(): string | null {
  return typeof window === "undefined"
    ? null
    : window.localStorage.getItem("legacy-vault.household-id");
}

export function mutationHeaders(version: number): HeadersInit {
  return {
    "idempotency-key": `web-${crypto.randomUUID()}`,
    "if-match": String(version),
  };
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  const householdId = activeHousehold();
  if (householdId) headers.set("x-household-id", householdId);
  if (init.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("json")
    ? ((await response.json()) as unknown)
    : await response.text();
  if (!response.ok) {
    const problem =
      payload && typeof payload === "object"
        ? (payload as ProblemDetails)
        : undefined;
    throw new ApiRequestError(
      problem?.detail ??
        problem?.title ??
        "The request could not be completed.",
      response.status,
      problem?.traceId,
    );
  }
  return payload as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError)
    return error.traceId
      ? `${error.message} Reference: ${error.traceId}`
      : error.message;
  return "The request could not be completed. Please try again.";
}

export async function verifyTotpStepUp(code: string): Promise<void> {
  if (!/^\d{6}$/u.test(code))
    throw new ApiRequestError("Enter the six-digit authenticator code.", 400);
  const response = await fetch("/api/auth/two-factor/verify-totp", {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ code, trustDevice: false }),
  });
  const payload = (await response.json()) as ProblemDetails & {
    message?: string;
  };
  if (!response.ok)
    throw new ApiRequestError(
      payload.detail ?? payload.message ?? "Multi-factor verification failed.",
      response.status,
      payload.traceId,
    );
}
