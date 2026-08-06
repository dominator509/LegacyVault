import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let web: ChildProcessWithoutNullStreams | undefined;
let browser: Browser | undefined;
let baseUrl = "";

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
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  web = spawn(
    process.execPath,
    [
      resolve("apps/web/node_modules/next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: resolve("apps/web"),
      env: { ...process.env, API_BASE_URL: "http://127.0.0.1:9" },
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
});

describe("real browser accessibility", () => {
  it("has no serious or critical axe violations on primary public flows", async () => {
    if (!browser) throw new Error("browser unavailable");
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const path of ["/", "/sign-in", "/onboarding", "/dashboard"]) {
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
});
