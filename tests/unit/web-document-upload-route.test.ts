import { createHash } from "node:crypto";
import {
  decryptEnvelope,
  type EncryptedEnvelope,
} from "../../packages/crypto/src/index.js";
import { NextRequest } from "../../apps/web/node_modules/next/server.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../../apps/web/app/api/documents/upload/route.js";
import { WebUploadApiDouble } from "./doubles/web-upload-api.js";

let endpoint: WebUploadApiDouble;
let previousApiBase: string | undefined;

beforeEach(async () => {
  previousApiBase = process.env.API_BASE_URL;
  endpoint = new WebUploadApiDouble();
  await endpoint.start();
  process.env.API_BASE_URL = endpoint.baseUrl;
});

afterEach(async () => {
  if (previousApiBase === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = previousApiBase;
  await endpoint.close();
});

describe("first-party encrypted document upload route", () => {
  it("encrypts before object upload and returns neither plaintext nor key material", async () => {
    const plaintext = Buffer.from("household continuity document", "utf8");
    const form = new FormData();
    form.set(
      "document",
      new File([plaintext], "continuity.pdf", { type: "application/pdf" }),
    );
    form.set("retention", "delete");
    form.set("documentConsent", "on");
    const request = new NextRequest(
      "http://app.example.test/api/documents/upload",
      {
        method: "POST",
        headers: {
          origin: "http://app.example.test",
          cookie: "legacy-vault.session=test",
          "x-household-id": endpoint.householdId,
        },
        body: form,
      },
    );
    const response = await POST(request);
    expect(response.status).toBe(202);
    const responseText = await response.text();
    expect(responseText).not.toContain(plaintext.toString("utf8"));
    expect(responseText).not.toContain(endpoint.dataKey.toString("base64"));
    expect(responseText).not.toContain("/object");
    expect(endpoint.observedCookie).toBe("legacy-vault.session=test");
    expect(endpoint.uploadedCiphertext).toBeDefined();
    const digest = createHash("sha256")
      .update(endpoint.uploadedCiphertext!)
      .digest();
    expect(endpoint.uploadChecksum).toBe(digest.toString("base64"));
    expect(endpoint.completeBody).toEqual({
      ciphertextSha256: digest.toString("hex"),
    });
    const envelope = JSON.parse(
      endpoint.uploadedCiphertext!.toString("utf8"),
    ) as EncryptedEnvelope;
    const opened = decryptEnvelope(envelope, endpoint.dataKey, {
      organizationId: endpoint.organizationId,
      householdId: endpoint.householdId,
      recordId: endpoint.documentId,
      purpose: "document-original",
      keyVersion: 1,
    });
    try {
      expect(Buffer.from(opened)).toEqual(plaintext);
    } finally {
      opened.fill(0);
      plaintext.fill(0);
    }
  });

  it("rejects a cross-origin upload before contacting the API", async () => {
    const form = new FormData();
    form.set(
      "document",
      new File(["safe"], "safe.pdf", { type: "application/pdf" }),
    );
    form.set("retention", "keep");
    form.set("documentConsent", "on");
    const response = await POST(
      new NextRequest("http://app.example.test/api/documents/upload", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "x-household-id": endpoint.householdId,
        },
        body: form,
      }),
    );
    expect(response.status).toBe(403);
    expect(endpoint.uploadedCiphertext).toBeUndefined();
  });
});
