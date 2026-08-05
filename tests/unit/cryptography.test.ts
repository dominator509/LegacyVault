import { generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createWrappedHouseholdKey,
  decryptEnvelope,
  encryptEnvelope,
  ExportManifestSigner,
  unwrapHouseholdKey,
} from "../../packages/crypto/src/index.js";
describe("household envelope encryption", () => {
  it("wraps a household DEK and binds ciphertext to tenant, record, purpose, and version", () => {
    const kek = randomBytes(32);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const householdId = "22222222-2222-4222-8222-222222222222";
    const { plaintextKey, wrappedKey } = createWrappedHouseholdKey({
      keyEncryptionKey: kek,
      organizationId,
      householdId,
      keyVersion: 1,
    });
    expect(
      unwrapHouseholdKey(wrappedKey, kek, organizationId, householdId),
    ).toEqual(plaintextKey);
    const context = {
      organizationId,
      householdId,
      recordId: "33333333-3333-4333-8333-333333333333",
      purpose: "fact-value",
      keyVersion: 1,
    };
    const envelope = encryptEnvelope(
      Buffer.from("sensitive value"),
      plaintextKey,
      context,
    );
    expect(
      Buffer.from(decryptEnvelope(envelope, plaintextKey, context)).toString(
        "utf8",
      ),
    ).toBe("sensitive value");
    expect(() =>
      decryptEnvelope(envelope, plaintextKey, {
        ...context,
        householdId: organizationId,
      }),
    ).toThrow(/authentication failed/);
  });
});
describe("portable export signatures", () => {
  it("signs canonical bytes with Ed25519 and rejects changed manifests", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const privateKeyBase64 = privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64");
    const signer = new ExportManifestSigner(privateKeyBase64);
    const manifest = Buffer.from('{"exportVersion":1}');
    const signature = signer.sign(manifest);
    expect(
      ExportManifestSigner.verify(
        manifest,
        signature,
        signer.publicKeySpkiBase64(),
      ),
    ).toBe(true);
    expect(
      ExportManifestSigner.verify(
        Buffer.from('{"exportVersion":2}'),
        signature,
        signer.publicKeySpkiBase64(),
      ),
    ).toBe(false);
  });
});
