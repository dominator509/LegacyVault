import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

async function requestBody(
  request: import("node:http").IncomingMessage,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export class WebUploadApiDouble {
  readonly organizationId = randomUUID();
  readonly householdId = randomUUID();
  readonly documentId = randomUUID();
  readonly dataKey = randomBytes(32);
  uploadedCiphertext: Buffer | undefined;
  uploadChecksum: string | undefined;
  completeBody: unknown;
  observedCookie: string | undefined;
  private server: Server | undefined;
  baseUrl = "";

  async start(): Promise<void> {
    this.server = createServer(async (request, response) => {
      try {
        this.observedCookie = request.headers.cookie;
        const url = new URL(
          request.url ?? "/",
          this.baseUrl || "http://127.0.0.1",
        );
        response.setHeader("content-type", "application/json");
        if (request.method === "GET" && url.pathname === "/v1/households") {
          response.end(
            JSON.stringify({
              households: [
                {
                  id: this.householdId,
                  organizationId: this.organizationId,
                  name: "Test household",
                  role: "Owner",
                  version: 1,
                },
              ],
            }),
          );
          return;
        }
        if (request.method === "POST" && url.pathname === "/v1/documents") {
          await requestBody(request);
          response.statusCode = 201;
          response.end(
            JSON.stringify({
              document: {
                id: this.documentId,
                status: "pending-upload",
                version: 1,
              },
              encryption: {
                algorithm: "A256GCM",
                keyBase64: this.dataKey.toString("base64"),
                keyVersion: 1,
                purpose: "document-original",
              },
            }),
          );
          return;
        }
        if (
          request.method === "POST" &&
          url.pathname === `/v1/documents/${this.documentId}/upload-url`
        ) {
          await requestBody(request);
          response.end(
            JSON.stringify({
              uploadUrl: `${this.baseUrl}/object`,
              expiresInSeconds: 300,
            }),
          );
          return;
        }
        if (request.method === "PUT" && url.pathname === "/object") {
          this.uploadedCiphertext = await requestBody(request);
          this.uploadChecksum = request.headers["x-amz-checksum-sha256"] as
            string | undefined;
          response.statusCode = 200;
          response.end("{}");
          return;
        }
        if (
          request.method === "POST" &&
          url.pathname === `/v1/documents/${this.documentId}/complete`
        ) {
          this.completeBody = JSON.parse(
            (await requestBody(request)).toString("utf8"),
          );
          response.statusCode = 202;
          response.end(
            JSON.stringify({
              document: {
                id: this.documentId,
                status: "quarantined",
                version: 2,
              },
              workflow: { status: "pending", version: 1 },
            }),
          );
          return;
        }
        response.statusCode = 404;
        response.end(JSON.stringify({ detail: "not found" }));
      } catch {
        response.statusCode = 500;
        response.end(JSON.stringify({ detail: "test endpoint failed" }));
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(0, "127.0.0.1", () => resolve());
    });
    const address = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server?.close((error) => (error ? reject(error) : resolve())),
    );
    this.dataKey.fill(0);
  }
}
