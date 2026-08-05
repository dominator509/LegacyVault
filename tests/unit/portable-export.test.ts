import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ExportManifestSigner } from "../../packages/crypto/src/index.js";
import {
  createPortableExport,
  PortableExportError,
  verifyAndOpenPortableExport,
} from "../../packages/reports/src/index.js";

function signingMaterial() {
  const { privateKey } = generateKeyPairSync("ed25519");
  const privateKeyPkcs8Base64 = privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64");
  return {
    privateKeyPkcs8Base64,
    publicKeySpkiBase64: new ExportManifestSigner(
      privateKeyPkcs8Base64,
    ).publicKeySpkiBase64(),
  };
}

describe("encrypted portable exports", () => {
  it("sorts, encrypts, signs, verifies, and opens household entries", () => {
    const key = randomBytes(32);
    const signing = signingMaterial();
    const archiveId = randomUUID();
    const container = createPortableExport({
      archiveId,
      organizationId: randomUUID(),
      householdId: randomUUID(),
      createdAt: "2026-08-05T22:00:00.000Z",
      keyVersion: 1,
      exportKey: key,
      signingKeyPkcs8Base64: signing.privateKeyPkcs8Base64,
      entries: [
        {
          path: "documents/policy.pdf",
          mediaType: "application/pdf",
          bytes: Buffer.from("pdf bytes"),
        },
        {
          path: "records/facts.json",
          mediaType: "application/json",
          bytes: Buffer.from('{"confirmed":true}'),
        },
      ],
    });
    expect(Buffer.from(container).toString("utf8")).not.toContain("pdf bytes");
    const opened = verifyAndOpenPortableExport({
      container,
      exportKey: key,
      trustedPublicKeySpkiBase64: signing.publicKeySpkiBase64,
    });
    expect(opened.archiveId).toBe(archiveId);
    expect(opened.entries.map((entry) => entry.path)).toEqual([
      "documents/policy.pdf",
      "records/facts.json",
    ]);
    expect(
      Buffer.from(opened.entries[0]?.contentBase64 ?? "", "base64").toString(
        "utf8",
      ),
    ).toBe("pdf bytes");
  });

  it("rejects unsafe paths, untrusted signers, tampering, and wrong keys", () => {
    const key = randomBytes(32);
    const signing = signingMaterial();
    const base = {
      archiveId: randomUUID(),
      organizationId: randomUUID(),
      householdId: randomUUID(),
      createdAt: "2026-08-05T22:00:00.000Z",
      keyVersion: 1,
      exportKey: key,
      signingKeyPkcs8Base64: signing.privateKeyPkcs8Base64,
    };
    expect(() =>
      createPortableExport({
        ...base,
        entries: [
          {
            path: "../escape.txt",
            mediaType: "text/plain",
            bytes: Buffer.from("escape"),
          },
        ],
      }),
    ).toThrow(PortableExportError);
    const container = createPortableExport({
      ...base,
      entries: [
        {
          path: "records/export.json",
          mediaType: "application/json",
          bytes: Buffer.from("{}"),
        },
      ],
    });
    expect(() =>
      verifyAndOpenPortableExport({
        container,
        exportKey: key,
        trustedPublicKeySpkiBase64: signingMaterial().publicKeySpkiBase64,
      }),
    ).toThrow(PortableExportError);
    expect(() =>
      verifyAndOpenPortableExport({
        container,
        exportKey: randomBytes(32),
        trustedPublicKeySpkiBase64: signing.publicKeySpkiBase64,
      }),
    ).toThrow(PortableExportError);
    const parsed = JSON.parse(Buffer.from(container).toString("utf8")) as {
      envelope: { ciphertext: string };
    };
    parsed.envelope.ciphertext = `${parsed.envelope.ciphertext.slice(0, -2)}AA`;
    expect(() =>
      verifyAndOpenPortableExport({
        container: Buffer.from(JSON.stringify(parsed)),
        exportKey: key,
        trustedPublicKeySpkiBase64: signing.publicKeySpkiBase64,
      }),
    ).toThrow(PortableExportError);
  });
});
