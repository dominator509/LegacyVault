import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser } from "@playwright/test";
import { createApplicationRuntime } from "../../apps/api/src/runtime.js";
import { buildServer } from "../../apps/api/src/server.js";
import { loadEnvironment } from "../../packages/contracts/src/environment.js";
import { createDatabaseClient } from "../../packages/database/src/client.js";
import { runMigrations } from "../../packages/database/src/migrate.js";
import { readLocalEnvironment } from "../helpers/local-environment.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let web: ChildProcessWithoutNullStreams | undefined;
let browser: Browser | undefined;
let baseUrl = "";
let apiBaseUrl = "";
let api: ReturnType<typeof buildServer> | undefined;
let runtime: ReturnType<typeof createApplicationRuntime> | undefined;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("web test could not allocate a port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

beforeAll(async () => {
  const [port, apiPort] = await Promise.all([freePort(), freePort()]);
  baseUrl = `http://localhost:${port}`;
  apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const local = readLocalEnvironment();
  const databaseUrl = local.TEST_DATABASE_URL ?? "";
  await runMigrations(databaseUrl);
  runtime = createApplicationRuntime(
    loadEnvironment({
      ...local,
      NODE_ENV: "test",
      LOCAL_ENGINEERING_MODE: "true",
      DATABASE_URL: databaseUrl,
      API_BASE_URL: apiBaseUrl,
      APP_BASE_URL: baseUrl,
      WORKFLOW_QUEUE_NAME: `e2e-passkey-${process.pid}-${randomUUID()}`,
    }),
  );
  api = buildServer(runtime.dependencies);
  await api.listen({ host: "127.0.0.1", port: apiPort });
  web = spawn(
    process.execPath,
    [
      resolve("apps/web/node_modules/next/dist/bin/next"),
      "dev",
      "--hostname",
      "localhost",
      "--port",
      String(port),
    ],
    {
      cwd: resolve("apps/web"),
      env: { ...process.env, API_BASE_URL: apiBaseUrl },
      windowsHide: true,
      stdio: "pipe",
    },
  );
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (web.exitCode !== null) break;
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The bounded readiness loop owns transient connection refusal.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) {
    const output = `${web.stderr.read() ?? ""}`.slice(-2_000);
    throw new Error(`Next.js did not become ready: ${output}`);
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.platform === "win32"
      ? {
          executablePath:
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        }
      : {}),
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  if (web && web.exitCode === null) web.kill();
  await api?.close();
  await runtime?.close();
});

describe("real browser outcomes and accessibility", () => {
  it("has no serious or critical axe violations on primary public flows", async () => {
    if (!browser) throw new Error("browser unavailable");
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const path of [
      "/",
      "/sign-in",
      "/onboarding",
      "/dashboard",
      "/billing",
      "/exports",
      "/recover",
      "/two-factor",
      "/security",
    ]) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
      const result = await new AxeBuilder({ page }).analyze();
      expect(
        result.violations.filter(
          (violation) =>
            violation.impact === "critical" || violation.impact === "serious",
        ),
        path,
      ).toEqual([]);
    }
    await context.close();
  }, 30_000);

  it("supports keyboard skip navigation, readable text, targets, and reduced motion", async () => {
    if (!browser) throw new Error("browser unavailable");
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus").textContent()).resolves.toContain(
      "Skip to main content",
    );
    await page.keyboard.press("Enter");
    expect(
      await page
        .locator("#main-content")
        .evaluate(
          (node) =>
            node === document.activeElement ||
            location.hash === "#main-content",
        ),
    ).toBe(true);
    expect(
      await page
        .locator("body")
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThanOrEqual(18);
    const minimumTarget = await page
      .locator(".button")
      .first()
      .evaluate((node) =>
        Math.min(
          node.getBoundingClientRect().width,
          node.getBoundingClientRect().height,
        ),
      );
    expect(minimumTarget).toBeGreaterThanOrEqual(44);
    expect(
      await page
        .locator("html")
        .evaluate((node) => getComputedStyle(node).scrollBehavior),
    ).toBe("auto");
    await context.close();
  }, 20_000);

  it("uses strong authentication to complete the core local household continuity flow", async () => {
    if (!browser) throw new Error("browser unavailable");
    const email = `passkey-${randomUUID()}@example.test`;
    const password = "passkey browser password has enough length 2026";
    const signup = await fetch(`${apiBaseUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: baseUrl,
      },
      body: JSON.stringify({ name: "Passkey Browser User", email, password }),
    });
    expect(signup.status).toBe(200);
    const local = readLocalEnvironment();
    const client = createDatabaseClient(local.TEST_DATABASE_URL ?? "");
    await client.connect();
    try {
      await client.query(
        'update "user" set "emailVerified"=true where email=$1',
        [email],
      );
    } finally {
      await client.end();
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    await page.goto(`${baseUrl}/sign-in`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.locator("form").getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await page.goto(`${baseUrl}/security`, { waitUntil: "networkidle" });
    await page.getByLabel("Passkey name").fill("Chrome virtual authenticator");
    await page
      .getByRole("button", { name: "Add passkey on this device" })
      .click();
    await page.waitForFunction(
      () =>
        document.body.textContent?.includes(
          "Passkey added after device verification.",
        ) || document.querySelector('.error[role="alert"]'),
      undefined,
      { timeout: 15_000 },
    );
    const alertLocator = page.locator('.error[role="alert"]');
    const alert = (await alertLocator.count())
      ? await alertLocator.textContent()
      : null;
    expect(alert, "passkey registration status").toBeNull();
    const registeredPasskey = page.getByText("Chrome virtual authenticator", {
      exact: true,
    });
    await registeredPasskey.waitFor({ state: "visible" });
    expect(await registeredPasskey.isVisible()).toBe(true);

    await context.clearCookies();
    await page.goto(`${baseUrl}/sign-in`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto(`${baseUrl}/security`, { waitUntil: "networkidle" });
    await page
      .getByLabel("Current password, if this account uses one")
      .fill(password);
    await page.getByRole("button", { name: "Begin TOTP setup" }).click();
    const totpUri = await page
      .locator("code")
      .filter({ hasText: "otpauth://" })
      .textContent();
    const secret = new URL(totpUri ?? "").searchParams.get("secret");
    expect(secret).toBeTruthy();
    if (Math.floor(Date.now() / 1_000) % 30 > 27)
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    await page
      .getByLabel("Six-digit authenticator code")
      .fill(totp(secret ?? ""));
    await page.getByRole("button", { name: "Verify and enable MFA" }).click();
    await page.getByText("TOTP MFA enabled.", { exact: false }).waitFor();

    await page.goto(`${baseUrl}/onboarding`, { waitUntil: "networkidle" });
    await page.getByLabel("Organization name").fill("Browser Organization");
    await page.getByLabel("Household name").fill("Browser Household");
    await page.getByLabel("Your display name").fill("Browser Owner");
    await page.getByRole("button", { name: "Create household" }).click();
    await page.waitForURL("**/dashboard");

    if (!runtime) throw new Error("application runtime unavailable");
    const entitlementClient = createDatabaseClient(
      readLocalEnvironment().TEST_DATABASE_URL ?? "",
    );
    await entitlementClient.connect();
    try {
      const authUser = await entitlementClient.query<{ id: string }>(
        'select id from "user" where email=$1',
        [email],
      );
      const authUserId = authUser.rows[0]?.id;
      if (!authUserId)
        throw new Error("E2E auth user fixture was not persisted");
      await entitlementClient.query("begin");
      await entitlementClient.query(
        "select set_config('app.auth_user_id',$1,true)",
        [authUserId],
      );
      const membership = await entitlementClient.query<{
        organization_id: string;
        household_id: string;
        person_id: string;
      }>(
        "select organization_id,household_id,person_id from memberships where auth_user_id=$1",
        [authUserId],
      );
      await entitlementClient.query("commit");
      const row = membership.rows[0];
      if (!row) throw new Error("E2E membership fixture was not persisted");
      const providerCreatedAt = new Date().toISOString();
      const entitlement =
        await runtime.dependencies.repository.processBillingEvent(
          {
            organizationId: row.organization_id,
            householdId: row.household_id,
            actorId: row.person_id,
          },
          {
            externalEventId: `evt_local_e2e_${randomUUID()}`,
            eventType: "customer.subscription.updated",
            providerCreatedAt,
            providerCustomerId: `cus_local_e2e_${randomUUID()}`,
            providerSubscriptionId: `sub_local_e2e_${randomUUID()}`,
            status: "active",
            plan: "essential",
            trialEndsAt: null,
            currentPeriodEndsAt: new Date(
              Date.now() + 24 * 60 * 60 * 1_000,
            ).toISOString(),
            cancelAtPeriodEnd: false,
            canceledAt: null,
          },
        );
      expect(entitlement.outcome).toBe("applied");
    } finally {
      await entitlementClient.end();
    }

    await page.goto(`${baseUrl}/vault`, { waitUntil: "networkidle" });
    await page.getByLabel("Category").selectOption("insurance");
    await page.getByLabel("Field name").fill("carrier-name");
    await page.getByLabel("Value").fill("Example Mutual");
    await page.getByRole("button", { name: "Add candidate fact" }).click();
    await page
      .getByText("Candidate fact added. Review it before relying on it.")
      .waitFor();
    await page.getByText("insurance.carrier-name", { exact: true }).waitFor();

    await page.getByLabel("PDF or image").setInputFiles({
      name: "continuity.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n",
      ),
    });
    await page
      .getByLabel("Keep the encrypted original", { exact: false })
      .check();
    await page
      .getByLabel("I authorize document processing", { exact: false })
      .check();
    await page
      .getByRole("button", { name: "Encrypt and upload document" })
      .click();
    await page.waitForFunction(
      () =>
        document.body.textContent?.includes(
          "Encrypted upload accepted and quarantined",
        ) || document.querySelector('.error[role="alert"]'),
      undefined,
      { timeout: 30_000 },
    );
    const uploadErrorLocator = page.locator('.error[role="alert"]');
    const uploadError = (await uploadErrorLocator.count())
      ? await uploadErrorLocator.textContent()
      : null;
    expect(uploadError, "document upload status").toBeNull();

    await page.goto(`${baseUrl}/review`, { waitUntil: "networkidle" });
    await page.getByText("insurance.carrier-name", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Confirm after checking source" })
      .click();
    await page.getByText("Fact confirmed and now authoritative.").waitFor();

    await page.goto(`${baseUrl}/reports`, { waitUntil: "networkidle" });
    await page.getByLabel("Report type").selectOption("family-emergency-guide");
    await page.getByRole("button", { name: "Generate report" }).click();
    await page
      .getByText("Report queued. Processing continues in the background.")
      .waitFor();

    await page.goto(`${baseUrl}/exports`, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Generate key and start encrypted export" })
      .click();
    await page
      .getByText("Encrypted export queued. Save the key now", { exact: false })
      .waitFor();
    const renderedExportKey = await page.locator("code").first().textContent();
    expect(renderedExportKey).toMatch(/^[A-Za-z0-9+/]{43}=$/u);

    await page.goto(`${baseUrl}/members`, { waitUntil: "networkidle" });
    await page
      .getByLabel("Verified email address")
      .fill(`helper-${randomUUID()}@example.test`);
    await page.getByLabel("Role").selectOption("FamilyHelper");
    await page.getByRole("button", { name: "Send invitation" }).click();
    await page
      .getByText("Invitation sent. The link expires in 72 hours.")
      .waitFor();
    await page
      .getByRole("button", { name: "Revoke latest unused invitation" })
      .click();
    await page
      .getByText("Unused invitation revoked.", { exact: false })
      .waitFor();

    await page.goto(`${baseUrl}/privacy`, { waitUntil: "networkidle" });
    const privacyPreconditions = await page.evaluate(async () => {
      const householdId = window.localStorage.getItem(
        "legacy-vault.household-id",
      );
      const headers = householdId ? { "x-household-id": householdId } : {};
      const [households, ledger] = await Promise.all([
        fetch("/v1/households", { cache: "no-store" }),
        fetch("/v1/privacy-requests", { cache: "no-store", headers }),
      ]);
      return {
        householdStatus: households.status,
        householdBody: await households.text(),
        ledgerStatus: ledger.status,
        ledgerBody: await ledger.text(),
      };
    });
    expect(
      privacyPreconditions.householdStatus,
      privacyPreconditions.householdBody,
    ).toBe(200);
    expect(
      privacyPreconditions.ledgerStatus,
      privacyPreconditions.ledgerBody,
    ).toBe(200);
    await page.getByLabel("Request type").selectOption("access");
    const privacyResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/v1/privacy-requests"),
    );
    await page.getByRole("button", { name: "Submit privacy request" }).click();
    const privacyResponse = await privacyResponsePromise;
    expect(privacyResponse.status(), await privacyResponse.text()).toBe(202);
    await page.waitForFunction(
      () =>
        document.body.textContent?.includes(
          "Privacy request recorded. Its progress is visible below.",
        ) || document.querySelector('.error[role="alert"]'),
      undefined,
      { timeout: 30_000 },
    );
    const privacyErrorLocator = page.locator('.error[role="alert"]');
    const privacyError = (await privacyErrorLocator.count())
      ? await privacyErrorLocator.textContent()
      : null;
    expect(privacyError, "privacy request status").toBeNull();
    await page.getByText("access", { exact: true }).waitFor();

    await cdp.send("WebAuthn.disable");
    await context.close();
  }, 120_000);
});

function totp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.toUpperCase().replaceAll("=", "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("invalid base32 TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let index = 0; index < bytes.length; index += 1)
    bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  bytes.fill(0);
  counter.fill(0);
  digest.fill(0);
  return binary.toString().padStart(6, "0");
}
