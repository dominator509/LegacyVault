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

let householdSelection: Promise<string | null> | null = null;

async function ensureActiveHousehold(path: string): Promise<string | null> {
  const selected = activeHousehold();
  if (selected || path === "/v1/households" || !path.startsWith("/v1/"))
    return selected;
  householdSelection ??= apiRequest<{
    households: Array<{ id: string }>;
  }>("/v1/households").then(({ households }) => {
    const next = households[0]?.id ?? null;
    if (next) window.localStorage.setItem("legacy-vault.household-id", next);
    return next;
  });
  try {
    return await householdSelection;
  } finally {
    householdSelection = null;
  }
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
  const householdId = await ensureActiveHousehold(path);
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

interface AccountHouseholdMembership {
  id: string;
  personId: string;
}

export async function currentPersonId(): Promise<string> {
  const { households } = await apiRequest<{
    households: AccountHouseholdMembership[];
  }>("/v1/households");
  const selectedId = activeHousehold();
  const membership =
    households.find((household) => household.id === selectedId) ??
    households[0];
  if (!membership)
    throw new ApiRequestError(
      "Create or join a household before continuing.",
      409,
    );
  if (membership.id !== selectedId)
    window.localStorage.setItem("legacy-vault.household-id", membership.id);
  return membership.personId;
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
