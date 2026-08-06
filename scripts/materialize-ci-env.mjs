import { chmod, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true")
  throw new Error(
    "CI environment materialization is restricted to GitHub Actions",
  );

const overlayKeys = [
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
const values = parseEnv(await readFile(".env", "utf8"));
for (const key of overlayKeys) {
  const value = process.env[key];
  if (!value)
    throw new Error(`required CI environment value is absent: ${key}`);
  if (/["\\$`\r\n]/u.test(value))
    throw new Error(`CI environment value is not dotenv-safe: ${key}`);
  values[key] = value;
}
const body = `${Object.entries(values)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${key}="${value}"`)
  .join("\n")}\n`;
await writeFile(".env", body, { encoding: "utf8", mode: 0o600 });
await chmod(".env", 0o600);
process.stdout.write("CI environment: ok\n");
