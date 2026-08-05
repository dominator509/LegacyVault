import { readFileSync } from "node:fs";

export function readLocalEnvironment(): Record<string, string> {
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
