import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnvironment } from "../../packages/contracts/src/environment.js";
import { createApplicationRuntime } from "../../apps/api/src/runtime.js";
import { buildServer } from "../../apps/api/src/server.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

const local = readLocalEnvironment();
const environment = loadEnvironment({
  NODE_ENV: "test",
  LOCAL_ENGINEERING_MODE: "true",
  DATABASE_URL: local.TEST_DATABASE_URL,
  SESSION_SECRET: local.SESSION_SECRET,
  API_BASE_URL: "http://127.0.0.1:3001",
  APP_BASE_URL: "http://127.0.0.1:3000",
  EMAIL_FROM: "Legacy Vault <notices@localhost.invalid>",
});
const runtime = createApplicationRuntime(environment);
const server = buildServer(runtime.dependencies);

beforeAll(async () => {
  await runMigrations(environment.DATABASE_URL ?? "");
  await server.ready();
});

afterAll(async () => {
  await server.close();
  await runtime.close();
});

describe("composed application runtime", () => {
  it("persists a real signup and delivers its verification message through local SMTP", async () => {
    const suffix = randomUUID();
    const email = `runtime-${suffix}@example.test`;
    const signup = await server.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin: environment.APP_BASE_URL ?? "" },
      payload: {
        name: "Runtime Integration User",
        email,
        password: "runtime password has sufficient length 2026",
      },
    });
    expect(signup.statusCode).toBe(200);
    expect(signup.json()).toMatchObject({
      token: null,
      user: { email, emailVerified: false },
    });

    const messages = await fetch("http://127.0.0.1:8025/api/v1/messages");
    expect(messages.ok).toBe(true);
    const body = (await messages.json()) as { messages?: MailpitSummary[] };
    const summary = body.messages?.find((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
    expect(summary?.Subject).toBe("Verify email for Legacy Vault");
    const captured = await fetch(
      `http://127.0.0.1:8025/view/${summary?.ID}.txt`,
    );
    const text = await captured.text();
    expect(text).toContain("/api/auth/verify-email");
    expect(text).toContain("This link expires in 30 minutes.");
  }, 20_000);
});
