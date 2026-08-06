import { describe, expect, it } from "vitest";
import {
  DocumentQuarantineService,
  validateDocumentBytes,
} from "../../packages/documents/src/index.js";

describe("document signature validation", () => {
  it("accepts an authentic PDF signature", () => {
    expect(
      validateDocumentBytes({
        bytes: Buffer.from("%PDF-1.7\n%%EOF"),
        declaredMediaType: "application/pdf",
        maximumBytes: 1_024,
      }),
    ).toBe("application/pdf");
  });

  it("accepts each explicitly supported raster signature", () => {
    const fixtures = [
      {
        bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        mediaType: "image/jpeg",
      },
      {
        bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        mediaType: "image/png",
      },
      {
        bytes: Buffer.from([0x49, 0x49, 0x2a, 0x00]),
        mediaType: "image/tiff",
      },
    ] as const;
    for (const fixture of fixtures)
      expect(
        validateDocumentBytes({
          bytes: fixture.bytes,
          declaredMediaType: fixture.mediaType,
          maximumBytes: 1_024,
        }),
      ).toBe(fixture.mediaType);
  });

  it("rejects MIME spoofing, unsupported input, and oversized input", () => {
    expect(() =>
      validateDocumentBytes({
        bytes: Buffer.from("%PDF-1.7"),
        declaredMediaType: "image/png",
        maximumBytes: 1_024,
      }),
    ).toThrow(/does not match/);
    expect(() =>
      validateDocumentBytes({
        bytes: Buffer.from("not a document"),
        declaredMediaType: "application/pdf",
        maximumBytes: 1_024,
      }),
    ).toThrow(/not supported/);
    expect(() =>
      validateDocumentBytes({
        bytes: Buffer.from("%PDF-1.7"),
        declaredMediaType: "application/pdf",
        maximumBytes: 4,
      }),
    ).toThrow(/size limit/);
  });
});

describe("document quarantine state transitions", () => {
  it("does not mark an infected document clean", async () => {
    let markedClean = false;
    const service = new DocumentQuarantineService(
      {
        async getCiphertext() {
          return Buffer.from("%PDF-1.7\ncontent\n%%EOF");
        },
        async markClean() {
          markedClean = true;
        },
      },
      {
        async scan() {
          return { status: "infected", signature: "Unit-Test-Signature" };
        },
      },
      async (bytes) => bytes.slice(),
    );
    await expect(
      service.scan({
        objectKey: "quarantine/unit",
        declaredMediaType: "application/pdf",
        maximumBytes: 1_024,
      }),
    ).resolves.toEqual({
      status: "rejected-malware",
      signature: "Unit-Test-Signature",
    });
    expect(markedClean).toBe(false);
  });
});
