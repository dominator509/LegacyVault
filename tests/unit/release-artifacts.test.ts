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

  it("keeps pull-request CI local and leaves external preflight to the ship gate", () => {
    const workflow = readFileSync(
      path.join(root, ".github/workflows/verify.yml"),
      "utf8",
    );
    expect(workflow).not.toContain("sh scripts/verify.sh");
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\./u);
    expect(workflow).toContain("sh scripts/generate-local-env.sh");
    expect(workflow).toContain("docker compose up -d --wait");
    expect(workflow).toContain(
      "pnpm exec tsx scripts/bootstrap-local-storage.ts",
    );
    expect(workflow).toContain(
      "pnpm exec playwright install --with-deps chromium",
    );
    for (const gate of [
      "test-unit.sh",
      "test-integration.sh",
      "test-e2e.sh",
      "contract-test.sh",
      "security-check.sh",
      "dependency-audit.sh",
      "reality-gate.sh",
      "smoke-test.sh",
    ])
      expect(workflow).toContain(gate);
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("docker compose down");
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
    expect(workflow).toContain(
      "IMAGE_BUILD_TAG: ${{ inputs.release_tag }}-${{ github.sha }}-${{ github.run_id }}",
    );
    expect(workflow).toContain(
      'gh api --method POST "repos/${GITHUB_REPOSITORY}/git/refs"',
    );
    expect(workflow.indexOf("Staging smoke and live-fire")).toBeLessThan(
      workflow.indexOf("Publish immutable release tag after staging proof"),
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

  it("authenticates the configured recurring Stripe Price during preflight", () => {
    const probe = readFileSync(
      path.join(root, "scripts/probes/stripe.sh"),
      "utf8",
    );
    expect(probe).toContain("v1/balance");
    expect(probe).toContain("v1/prices/$STRIPE_PRICE_ESSENTIAL");
    expect(probe).toContain('.type == "recurring"');
    expect(probe).toContain(".active == true");
  });

  it("places PostgreSQL probe options before connection URLs for Windows psql", () => {
    for (const name of ["database_url.sh", "test_database_url.sh"]) {
      const probe = readFileSync(
        path.join(root, "scripts/probes", name),
        "utf8",
      );
      expect(probe).toMatch(
        /"\$psql_bin" -v ON_ERROR_STOP=1 -Atqc "[^"]+" "\$(?:TEST_)?DATABASE_URL"/u,
      );
    }
    const infrastructureTest = readFileSync(
      path.join(root, "tests/integration/local-infrastructure.test.ts"),
      "utf8",
    );
    expect(infrastructureTest).toContain(
      '["-Atqc", "select current_database()", local.DATABASE_URL ?? ""]',
    );
    expect(infrastructureTest).toContain(
      '["-Atqc", "select current_database()", local.TEST_DATABASE_URL ?? ""]',
    );
  });

  it("keeps Stripe sandbox live-fire synthetic and self-cleaning", () => {
    const test = readFileSync(
      path.join(root, "tests/live-fire/stripe-sandbox.test.ts"),
      "utf8",
    );
    const command = readFileSync(
      path.join(root, "scripts/stripe-live-fire.sh"),
      "utf8",
    );
    expect(test).toContain("synthetic-live-fire-");
    expect(test).toContain("/expire");
    expect(test).toContain("metadata[legacy_test_only]");
    expect(test).toContain("v1/customers/${customerId}");
    expect(test).toContain("requires a test-mode secret key");
    expect(command).toContain("tests/live-fire/stripe-sandbox.test.ts");
  });
});
