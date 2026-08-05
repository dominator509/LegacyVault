import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

export class CryptographicEnvelopeError extends Error {
  override readonly name = "CryptographicEnvelopeError";
}
export interface EncryptionContext {
  organizationId: string;
  householdId: string;
  recordId: string;
  purpose: string;
  keyVersion: number;
}
export interface EncryptedEnvelope {
  algorithm: "A256GCM";
  keyVersion: number;
  iv: string;
  ciphertext: string;
  authenticationTag: string;
}
export interface WrappedHouseholdKey extends EncryptedEnvelope {
  keyPurpose: "household-dek";
}

function assertAesKey(key: Uint8Array, name: string): void {
  if (key.byteLength !== 32)
    throw new CryptographicEnvelopeError(`${name} must be exactly 32 bytes`);
}
function associatedData(context: EncryptionContext): Buffer {
  if (!Number.isSafeInteger(context.keyVersion) || context.keyVersion < 1)
    throw new CryptographicEnvelopeError(
      "key version must be a positive integer",
    );
  return Buffer.from(
    [
      "legacy-vault",
      context.organizationId,
      context.householdId,
      context.recordId,
      context.purpose,
      `v${context.keyVersion}`,
    ].join(":"),
    "utf8",
  );
}
export function encryptEnvelope(
  plaintext: Uint8Array,
  key: Uint8Array,
  context: EncryptionContext,
): EncryptedEnvelope {
  assertAesKey(key, "data encryption key");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(associatedData(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    algorithm: "A256GCM",
    keyVersion: context.keyVersion,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
  };
}
export function decryptEnvelope(
  envelope: EncryptedEnvelope,
  key: Uint8Array,
  context: EncryptionContext,
): Uint8Array {
  assertAesKey(key, "data encryption key");
  if (
    envelope.algorithm !== "A256GCM" ||
    envelope.keyVersion !== context.keyVersion
  )
    throw new CryptographicEnvelopeError(
      "envelope algorithm or key version mismatch",
    );
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.iv, "base64"),
      { authTagLength: 16 },
    );
    decipher.setAAD(associatedData(context));
    decipher.setAuthTag(Buffer.from(envelope.authenticationTag, "base64"));
    return new Uint8Array(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]),
    );
  } catch {
    throw new CryptographicEnvelopeError("envelope authentication failed");
  }
}
export function createWrappedHouseholdKey(input: {
  keyEncryptionKey: Uint8Array;
  organizationId: string;
  householdId: string;
  keyVersion: number;
}): { plaintextKey: Uint8Array; wrappedKey: WrappedHouseholdKey } {
  assertAesKey(input.keyEncryptionKey, "key encryption key");
  const plaintextKey = new Uint8Array(randomBytes(32));
  const wrapped = encryptEnvelope(plaintextKey, input.keyEncryptionKey, {
    organizationId: input.organizationId,
    householdId: input.householdId,
    recordId: input.householdId,
    purpose: "household-dek",
    keyVersion: input.keyVersion,
  });
  return {
    plaintextKey,
    wrappedKey: { ...wrapped, keyPurpose: "household-dek" },
  };
}
export function unwrapHouseholdKey(
  wrapped: WrappedHouseholdKey,
  keyEncryptionKey: Uint8Array,
  organizationId: string,
  householdId: string,
): Uint8Array {
  if (wrapped.keyPurpose !== "household-dek")
    throw new CryptographicEnvelopeError("wrapped key purpose mismatch");
  return decryptEnvelope(wrapped, keyEncryptionKey, {
    organizationId,
    householdId,
    recordId: householdId,
    purpose: "household-dek",
    keyVersion: wrapped.keyVersion,
  });
}
export class ExportManifestSigner {
  readonly #privateKey: KeyObject;
  readonly #publicKey: KeyObject;
  constructor(privateKeyPkcs8Base64: string) {
    try {
      this.#privateKey = createPrivateKey({
        key: Buffer.from(privateKeyPkcs8Base64, "base64"),
        format: "der",
        type: "pkcs8",
      });
      if (this.#privateKey.asymmetricKeyType !== "ed25519")
        throw new Error("unexpected key type");
      this.#publicKey = createPublicKey(this.#privateKey);
    } catch {
      throw new CryptographicEnvelopeError(
        "export signing key must be an Ed25519 PKCS8 DER value encoded as base64",
      );
    }
  }
  sign(manifest: Uint8Array): string {
    return sign(null, manifest, this.#privateKey).toString("base64");
  }
  publicKeySpkiBase64(): string {
    return this.#publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64");
  }
  static verify(
    manifest: Uint8Array,
    signatureBase64: string,
    publicKeySpkiBase64: string,
  ): boolean {
    try {
      const publicKey = createPublicKey({
        key: Buffer.from(publicKeySpkiBase64, "base64"),
        format: "der",
        type: "spki",
      });
      return verify(
        null,
        manifest,
        publicKey,
        Buffer.from(signatureBase64, "base64"),
      );
    } catch {
      return false;
    }
  }
}

export * from "./store.js";
