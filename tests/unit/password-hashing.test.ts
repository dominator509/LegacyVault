import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../packages/auth/src/index.js";

describe("Argon2id password fallback", () => {
  it("hashes with the required algorithm and rejects a wrong password", async () => {
    const encoded = await hashPassword("correct horse battery staple 2026");
    expect(encoded).toMatch(/^\$argon2id\$/u);
    await expect(
      verifyPassword({
        password: "correct horse battery staple 2026",
        hash: encoded,
      }),
    ).resolves.toBe(true);
    await expect(
      verifyPassword({ password: "wrong password", hash: encoded }),
    ).resolves.toBe(false);
  });
});
