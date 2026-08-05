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
