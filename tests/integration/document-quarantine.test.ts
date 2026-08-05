import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  ClamAvScanner,
  DocumentObjectStore,
  DocumentQuarantineService,
} from "../../packages/documents/src/index.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const local = readLocalEnvironment();
const store = new DocumentObjectStore({
  endpoint: local.R2_ENDPOINT ?? "",
  region: "us-east-1",
  bucket: local.R2_BUCKET ?? "",
  accessKeyId: local.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: local.R2_SECRET_ACCESS_KEY ?? "",
  forcePathStyle: true,
  allowBucketCreation: true,
});
const scanner = new ClamAvScanner({
  host: "127.0.0.1",
  port: 13_310,
  timeoutMs: 15_000,
});
const created: string[] = [];

async function put(bytes: Buffer): Promise<string> {
  await store.ensureBucket();
  const objectKey = store.createObjectKey();
  created.push(objectKey);
  await store.putCiphertext({
    objectKey,
    ciphertext: bytes,
    checksumSha256Base64: createHash("sha256").update(bytes).digest("base64"),
    contentType: "application/octet-stream",
  });
  return objectKey;
}

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((objectKey) => store.deleteObject(objectKey)),
  );
});

describe("document quarantine workflow with real storage and malware scanner", () => {
  it("moves a clean, signature-matched document to clean state", async () => {
    const objectKey = await put(
      Buffer.from("%PDF-1.7\nclean test document\n%%EOF"),
    );
    const service = new DocumentQuarantineService(
      store,
      scanner,
      async (bytes) => bytes.slice(),
    );
    await expect(
      service.scan({
        objectKey,
        declaredMediaType: "application/pdf",
        maximumBytes: 10_000,
      }),
    ).resolves.toEqual({
      status: "clean-awaiting-ocr",
      mediaType: "application/pdf",
    });
    await expect(store.objectStatus(objectKey)).resolves.toBe("clean");
  });
});
