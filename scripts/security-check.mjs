import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const failures = [];
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

for (const file of tracked) {
  const normalized = file.replaceAll("\\", "/");
  if (/^\.env(?:\.|$)/u.test(normalized) && normalized !== ".env.example") {
    failures.push(`${normalized}: secret-bearing environment file is tracked`);
  }
  if (!/\.(?:[cm]?[jt]sx?|json|ya?ml|env|toml)$/u.test(normalized)) continue;
  const content = readFileSync(file, "utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/u.test(content)) {
    failures.push(`${normalized}: private key material is tracked`);
  }
  if (/\bsk_live_[A-Za-z0-9]{16,}\b/u.test(content)) {
    failures.push(`${normalized}: live Stripe secret pattern is tracked`);
  }
  if (/\bAKIA[0-9A-Z]{16}\b/u.test(content)) {
    failures.push(`${normalized}: AWS access key pattern is tracked`);
  }
  if (
    normalized.startsWith("apps/") &&
    /api\.deepseek\.com|DEEPSEEK_API_KEY/u.test(content)
  ) {
    failures.push(`${normalized}: application bypasses packages/ai-gateway`);
  }
}

for (const file of tracked.filter(
  (entry) => path.basename(entry) === "package.json",
)) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  for (const section of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (typeof version !== "string") continue;
      if (version.startsWith("workspace:")) continue;
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
        failures.push(
          `${file}: ${section}.${name} is not pinned exactly (${version})`,
        );
      }
    }
  }
}

const environmentContract = readFileSync(
  "packages/contracts/src/environment.ts",
  "utf8",
);
if (
  !environmentContract.includes(
    'value.NODE_ENV === "production" && value.LOCAL_ENGINEERING_MODE',
  )
) {
  failures.push(
    "environment contract does not fail closed on production local mode",
  );
}

if (failures.length > 0) {
  for (const failure of failures)
    process.stderr.write(`security: ${failure}\n`);
  process.exit(1);
}

process.stdout.write("security static assertions: ok\n");
