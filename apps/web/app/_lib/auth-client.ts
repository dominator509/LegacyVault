"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [passkeyClient(), twoFactorClient()],
});

export function authClientError(value: unknown): string {
  if (!value || typeof value !== "object")
    return "The authentication request could not be completed.";
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message.length
    ? message
    : "The authentication request could not be completed.";
}

export async function authRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const response = await fetch(`/api/auth${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = (await response.json()) as unknown;
  if (!response.ok) throw new Error(authClientError(payload));
  return payload as T;
}
