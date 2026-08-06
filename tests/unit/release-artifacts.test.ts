import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("release artifacts", () => {
  it("pins image inputs and every workflow action to immutable digests", () => {
    const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
    expect(dockerfile).toMatch(/^# syntax=.*@sha256:[a-f0-9]{64}$/mu);
    expect(dockerfile).toMatch(/^FROM node:[^\s]+@sha256:[a-f0-9]{64}/mu);
    expect(dockerfile).not.toContain("COPY . .");
    const workflow = readFileSync(
      path.join(root, ".github/workflows/release.yml"),
      "utf8",
    );
    for (const reference of workflow.matchAll(/uses:\s*([^\s#]+)/gu))
      expect(reference[1]).toMatch(/@[a-f0-9]{40}$/u);
    expect(workflow).not.toContain("environment: production");
  });

  it("materializes the CI allowlist without printing secret values", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "legacy-ci-env-"));
    const secret = "ci_secret_value_123456";
    const keys = [
      "DEEPSEEK_API_KEY",
      "DEEPSEEK_BASE_URL",
      "DEEPSEEK_MODEL",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ESSENTIAL",
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "TURNSTILE_SITE_KEY",
      "TURNSTILE_SECRET_KEY",
      "FLY_API_TOKEN",
      "FLY_APP_STAGING",
      "FLY_APP_PRODUCTION",
      "GHCR_TOKEN",
      "GHCR_OWNER",
      "SECURITY_CONTACT",
      "PRIVACY_CONTACT",
      "LEGAL_ENTITY_NAME",
      "LEGAL_ENTITY_ADDRESS",
    ];
    try {
      writeFileSync(path.join(directory, ".env"), "LOCAL_VALUE=preserved\n");
      const result = spawnSync(
        process.execPath,
        [path.join(root, "scripts/materialize-ci-env.mjs")],
        {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            CI: "true",
            GITHUB_ACTIONS: "true",
            ...Object.fromEntries(keys.map((key) => [key, secret])),
          },
        },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("CI environment: ok\n");
      expect(result.stdout).not.toContain(secret);
      expect(
        parseEnv(readFileSync(path.join(directory, ".env"), "utf8")),
      ).toMatchObject({
        LOCAL_VALUE: "preserved",
        STRIPE_SECRET_KEY: secret,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
