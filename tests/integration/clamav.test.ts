import { describe, expect, it } from "vitest";
import { ClamAvScanner } from "../../packages/documents/src/index.js";

const scanner = new ClamAvScanner({
  host: "127.0.0.1",
  port: 13_310,
  timeoutMs: 15_000,
});

describe("real ClamAV malware scanning", () => {
  it("accepts clean content and rejects the standard harmless test signature", async () => {
    await expect(
      scanner.scan(Buffer.from("clean integration-test content")),
    ).resolves.toEqual({
      status: "clean",
    });
    const eicar = Buffer.from(
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    );
    await expect(scanner.scan(eicar)).resolves.toMatchObject({
      status: "infected",
      signature: expect.stringMatching(/Eicar/i),
    });
  });
});
