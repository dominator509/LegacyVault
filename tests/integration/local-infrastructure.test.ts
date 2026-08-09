import { execFileSync } from "node:child_process";
import net from "node:net";
import { describe, expect, it } from "vitest";
import { readLocalEnvironment } from "../helpers/local-environment.js";

const local = readLocalEnvironment();

function psqlPath(): string {
  if (process.platform !== "win32") return "psql";
  const result = execFileSync("where.exe", ["psql"], { encoding: "utf8" });
  const candidate = result.split(/\r?\n/u).find(Boolean);
  if (!candidate) throw new Error("PostgreSQL client not found");
  return candidate;
}

function redisPing(urlString: string): Promise<string> {
  const target = new URL(urlString);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: target.hostname,
      port: Number(target.port),
      timeout: 5_000,
    });
    const encode = (...parts: string[]) =>
      `*${parts.length}\r\n${parts
        .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
        .join("")}`;
    let response = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(
        encode(
          "AUTH",
          decodeURIComponent(target.username || "default"),
          decodeURIComponent(target.password),
        ),
      );
      socket.write(encode("PING"));
    });
    socket.on("data", (chunk) => {
      response += chunk;
      if (response.includes("+PONG\r\n")) socket.end();
    });
    socket.on("timeout", () =>
      socket.destroy(new Error("Valkey readiness timeout")),
    );
    socket.on("error", reject);
    socket.on("close", () => resolve(response));
  });
}

describe("real local infrastructure", () => {
  it("connects to isolated application and test PostgreSQL databases", () => {
    const options = {
      encoding: "utf8" as const,
      env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
    };
    const applicationDatabase = execFileSync(
      psqlPath(),
      ["-Atqc", "select current_database()", local.DATABASE_URL ?? ""],
      options,
    ).trim();
    const testDatabase = execFileSync(
      psqlPath(),
      ["-Atqc", "select current_database()", local.TEST_DATABASE_URL ?? ""],
      options,
    ).trim();
    expect(applicationDatabase).toBe("legacy_vault");
    expect(testDatabase).toBe("legacy_vault_test");
  });

  it("authenticates and receives PONG from real Valkey", async () => {
    await expect(redisPing(local.REDIS_URL ?? "")).resolves.toContain(
      "+PONG\r\n",
    );
  });
});
