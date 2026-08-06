import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const requestHeaders = [
  "accept",
  "content-type",
  "cookie",
  "idempotency-key",
  "if-match",
  "origin",
  "user-agent",
  "x-household-id",
  "x-request-id",
] as const;
const responseHeaders = [
  "cache-control",
  "content-disposition",
  "content-type",
  "location",
  "set-cookie",
  "x-content-type-options",
  "x-request-id",
] as const;

export async function proxyApiRequest(
  request: NextRequest,
  upstreamPath: string,
): Promise<Response> {
  const traceId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const configured = process.env.API_BASE_URL;
    if (!configured) throw new Error("API_BASE_URL is not configured");
    const base = new URL(configured);
    if (process.env.NODE_ENV === "production" && base.protocol !== "https:")
      throw new Error("API_BASE_URL must use HTTPS in production");
    const target = new URL(upstreamPath, base);
    target.search = request.nextUrl.search;
    const headers = new Headers();
    for (const name of requestHeaders) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("x-request-id", traceId);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const returnedHeaders = new Headers();
    for (const name of responseHeaders) {
      const value = upstream.headers.get(name);
      if (value) returnedHeaders.set(name, value);
    }
    returnedHeaders.set("cache-control", "no-store");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: returnedHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        type: "about:blank",
        title: "Service unavailable",
        status: 503,
        detail: "Legacy Vault could not reach its API.",
        traceId,
      },
      {
        status: 503,
        headers: {
          "cache-control": "no-store",
          "content-type": "application/problem+json",
        },
      },
    );
  }
}
