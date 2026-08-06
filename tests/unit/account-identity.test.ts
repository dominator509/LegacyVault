import { describe, expect, it } from "vitest";
import {
  AuthenticationRequiredError,
  resolveRequestAccount,
} from "../../packages/auth/src/identity.js";

describe("pre-membership account identity", () => {
  it("requires a verified authenticated email without resolving a tenant", async () => {
    await expect(
      resolveRequestAccount({ getSession: async () => null }, {}),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    await expect(
      resolveRequestAccount(
        {
          getSession: async () => ({
            user: {
              id: "unverified-user",
              email: "unverified@example.test",
              emailVerified: false,
            },
            session: { createdAt: new Date() },
          }),
        },
        {},
      ),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    await expect(
      resolveRequestAccount(
        {
          getSession: async () => ({
            user: {
              id: "verified-user",
              email: "verified@example.test",
              emailVerified: true,
            },
            session: { createdAt: new Date() },
          }),
        },
        {},
      ),
    ).resolves.toEqual({
      authUserId: "verified-user",
      email: "verified@example.test",
      emailVerified: true,
    });
  });
});
