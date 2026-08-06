import { createHash, randomUUID } from "node:crypto";
import { encryptEnvelope } from "@legacy/crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

class UpstreamProblem extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function apiBase(): URL {
  const configured = process.env.API_BASE_URL;
  if (!configured) throw new Error("API_BASE_URL is not configured");
  const base = new URL(configured);
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:")
    throw new Error("API_BASE_URL must use HTTPS in production");
  return base;
}

async function apiJson<T>(
  request: NextRequest,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  for (const name of ["cookie", "x-household-id", "x-request-id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(new URL(path, apiBase()), {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json()) as { detail?: string } & T;
  if (!response.ok)
    throw new UpstreamProblem(
      response.status,
      payload.detail ?? "The API rejected the upload request.",
    );
  return payload;
}

export async function POST(request: NextRequest) {
  const traceId = request.headers.get("x-request-id") ?? randomUUID();
  let plaintext: Buffer | undefined;
  let dataKey: Buffer | undefined;
  let encryptedBody: Buffer | undefined;
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin)
      throw new UpstreamProblem(403, "The upload origin is not allowed.");
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 101 * 1024 * 1024)
      throw new UpstreamProblem(413, "The upload request is too large.");
    const householdId = request.headers.get("x-household-id");
    if (!householdId)
      throw new UpstreamProblem(
        400,
        "Select an active household before uploading.",
      );
    const form = await request.formData();
    const file = form.get("document");
    if (!(file instanceof File) || file.size < 1)
      throw new UpstreamProblem(400, "Choose a document to upload.");
    if (file.size > 100 * 1024 * 1024)
      throw new UpstreamProblem(413, "Documents must be 100 MB or smaller.");
    if (
      !["application/pdf", "image/jpeg", "image/png", "image/tiff"].includes(
        file.type,
      )
    )
      throw new UpstreamProblem(415, "Use a PDF, JPEG, PNG, or TIFF document.");
    if (!form.has("documentConsent"))
      throw new UpstreamProblem(
        400,
        "Document processing consent is required.",
      );
    const retention = form.get("retention");
    if (retention !== "keep" && retention !== "delete")
      throw new UpstreamProblem(400, "Choose an original retention option.");
    const { households } = await apiJson<{
      households: { id: string; organizationId: string }[];
    }>(request, "/v1/households");
    const household = households.find((item) => item.id === householdId);
    if (!household)
      throw new UpstreamProblem(403, "The active household is unavailable.");
    plaintext = Buffer.from(await file.arrayBuffer());
    const started = await apiJson<{
      document: { id: string; version: number };
      encryption: {
        keyBase64: string;
        keyVersion: number;
        purpose: "document-original";
      };
    }>(request, "/v1/documents", {
      method: "POST",
      headers: {
        "idempotency-key": `web-document-start-${randomUUID()}`,
        "if-match": "0",
      },
      body: JSON.stringify({
        originalSha256: createHash("sha256").update(plaintext).digest("hex"),
        mediaType: file.type,
        maximumBytes: file.size,
        documentConsentPolicyVersion: "document-processing-v1",
        deleteOriginalAfterProcessing: retention === "delete",
      }),
    });
    dataKey = Buffer.from(started.encryption.keyBase64, "base64");
    encryptedBody = Buffer.from(
      JSON.stringify(
        encryptEnvelope(plaintext, dataKey, {
          organizationId: household.organizationId,
          householdId: household.id,
          recordId: started.document.id,
          purpose: started.encryption.purpose,
          keyVersion: started.encryption.keyVersion,
        }),
      ),
      "utf8",
    );
    const digest = createHash("sha256").update(encryptedBody).digest();
    const ciphertextSha256 = digest.toString("hex");
    const signed = await apiJson<{ uploadUrl: string }>(
      request,
      `/v1/documents/${started.document.id}/upload-url`,
      {
        method: "POST",
        headers: {
          "idempotency-key": `web-document-url-${randomUUID()}`,
          "if-match": String(started.document.version),
        },
        body: JSON.stringify({ ciphertextSha256 }),
      },
    );
    const uploaded = await fetch(signed.uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": "application/vnd.legacy-vault.encrypted+json",
        "x-amz-checksum-sha256": digest.toString("base64"),
      },
      body: encryptedBody.toString("utf8"),
      signal: AbortSignal.timeout(30_000),
    });
    if (!uploaded.ok)
      throw new UpstreamProblem(
        502,
        "Encrypted object upload failed before processing.",
      );
    const completed = await apiJson<unknown>(
      request,
      `/v1/documents/${started.document.id}/complete`,
      {
        method: "POST",
        headers: {
          "idempotency-key": `web-document-complete-${randomUUID()}`,
          "if-match": String(started.document.version),
        },
        body: JSON.stringify({ ciphertextSha256 }),
      },
    );
    return NextResponse.json(completed, {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (caught) {
    const status = caught instanceof UpstreamProblem ? caught.status : 503;
    return NextResponse.json(
      {
        type: "about:blank",
        title: status === 503 ? "Upload unavailable" : "Upload rejected",
        status,
        detail:
          caught instanceof UpstreamProblem
            ? caught.message
            : "The encrypted upload could not be completed.",
        traceId,
      },
      {
        status,
        headers: {
          "cache-control": "no-store",
          "content-type": "application/problem+json",
        },
      },
    );
  } finally {
    plaintext?.fill(0);
    dataKey?.fill(0);
    encryptedBody?.fill(0);
  }
}
