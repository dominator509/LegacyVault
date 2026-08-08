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
    const workflows = ["release.yml", "verify.yml"].map((name) =>
      readFileSync(path.join(root, ".github/workflows", name), "utf8"),
    );
    for (const workflow of workflows) {
      for (const reference of workflow.matchAll(/uses:\s*([^\s#]+)/gu))
        expect(reference[1]).toMatch(/@[a-f0-9]{40}$/u);
      expect(workflow.indexOf("pnpm/action-setup@")).toBeGreaterThan(-1);
      expect(workflow.indexOf("pnpm/action-setup@")).toBeLessThan(
        workflow.indexOf("actions/setup-node@"),
      );
    }
    expect(workflows[0]).not.toContain("environment: production");
  });

  it("limits release credentials and elevated permissions to required steps", () => {
    const workflow = readFileSync(
      path.join(root, ".github/workflows/release.yml"),
      "utf8",
    );
    const topLevelPermissions = workflow.match(
      /^permissions:\r?\n([\s\S]*?)\r?\n\r?\nconcurrency:/mu,
    )?.[1];
    expect(topLevelPermissions?.trim()).toBe("contents: read");
    expect(workflow).toMatch(
      /build-sign-deploy-staging:[\s\S]*?permissions:\n      contents: read\n      packages: write\n      id-token: write/u,
    );
    expect(workflow).not.toMatch(
      /release-gate:[\s\S]*?\n    env:\n[\s\S]*?DEEPSEEK_API_KEY/u,
    );
    expect(workflow).toMatch(
      /name: Materialize protected readiness environment[\s\S]*?env:[\s\S]*?DEEPSEEK_API_KEY/u,
    );
    expect(workflow).toMatch(
      /name: Deploy named staging app by digest\n        env:\n          FLY_API_TOKEN:/u,
    );
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

  it("requires every preflight evidence artifact at the ship gate", () => {
    const preflight = readFileSync(path.join(root, "PREFLIGHT.md"), "utf8");
    const readiness = readFileSync(
      path.join(root, "scripts/production-readiness-check.sh"),
      "utf8",
    );
    const evidence = preflight.match(
      /## Required evidence files\s+([\s\S]*?)\s+PREFLIGHT-TABLE-BEGIN/u,
    )?.[1];
    expect(evidence).toBeDefined();
    for (const match of evidence?.matchAll(/- (compliance\/evidence\/\S+)/gu) ??
      [])
      expect(readiness).toContain(match[1]);
  });
});
