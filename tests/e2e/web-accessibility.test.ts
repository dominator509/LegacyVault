import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
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

describe("real browser accessibility", () => {
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

  it("registers and signs in with a real passkey ceremony", async () => {
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
    await cdp.send("WebAuthn.disable");
    await context.close();
  }, 45_000);
});
