import { describe, expect, it } from "vitest";
import { ExportManifestSigner } from "../../packages/crypto/src/index.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

describe("generated local cryptographic configuration", () => {
  it("contains an exact AES-256 KEK, strong audit key, and valid Ed25519 signer", () => {
    const environment = readLocalEnvironment();
    expect(
      Buffer.from(environment.APP_ENCRYPTION_KEK ?? "", "base64"),
    ).toHaveLength(32);
    expect(
      Buffer.from(environment.AUDIT_HMAC_KEY ?? "", "base64").byteLength,
    ).toBeGreaterThanOrEqual(32);
    const signer = new ExportManifestSigner(
      environment.EXPORT_SIGNING_KEY ?? "",
    );
    const payload = Buffer.from("local crypto configuration proof");
    expect(
      ExportManifestSigner.verify(
        payload,
        signer.sign(payload),
        signer.publicKeySpkiBase64(),
      ),
    ).toBe(true);
  });
});
