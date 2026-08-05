import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DocumentObjectStore } from "../../packages/documents/src/index.js";
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

describe("real S3-compatible document storage", () => {
  it("stores, verifies, reads, transitions, and deletes ciphertext", async () => {
    await store.ensureBucket();
    const objectKey = store.createObjectKey();
    const ciphertext = Buffer.from(
      "encrypted-test-object-not-plaintext-customer-data",
    );
    const checksum = createHash("sha256").update(ciphertext).digest("base64");
    await store.putCiphertext({
      objectKey,
      ciphertext,
      checksumSha256Base64: checksum,
      contentType: "application/octet-stream",
    });
    await store.assertStoredChecksum(objectKey, checksum);
    await expect(store.getCiphertext(objectKey)).resolves.toEqual(
      new Uint8Array(ciphertext),
    );
    await store.markClean(objectKey);
    await store.deleteObject(objectKey);
  });
});
