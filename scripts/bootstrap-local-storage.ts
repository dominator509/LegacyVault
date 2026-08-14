import { readFileSync } from "node:fs";
import { DocumentObjectStore } from "../packages/documents/src/index.js";

function readLocalEnvironment(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(".env", "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    let value = line.slice(separator + 1);
    if (value.startsWith('"') && value.endsWith('"'))
      value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

async function main(): Promise<void> {
  const environment = readLocalEnvironment();
  if (environment.LOCAL_ENGINEERING_MODE !== "true")
    throw new Error("local object storage bootstrap requires engineering mode");

  const endpoint = environment.R2_ENDPOINT;
  const accessKeyId = environment.R2_ACCESS_KEY_ID;
  const secretAccessKey = environment.R2_SECRET_ACCESS_KEY;
  const bucket = environment.R2_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket)
    throw new Error("local object storage configuration is incomplete");

  const url = new URL(endpoint);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname))
    throw new Error("local object storage endpoint must be loopback");

  const store = new DocumentObjectStore({
    endpoint,
    region: "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: true,
    allowBucketCreation: true,
  });
  await store.ensureBucket();
  console.log("local object storage: ok");
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "local object storage failed",
  );
  process.exitCode = 1;
});
