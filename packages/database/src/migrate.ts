import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const migrationDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../drizzle",
);

export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
    application_name: "legacy-vault-migrator",
  });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock(67124401)");
    await client.query(
      "create table if not exists schema_migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now())",
    );
    for (const name of (await readdir(migrationDirectory))
      .filter((entry) => entry.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(path.join(migrationDirectory, name), "utf8");
      const sha256 = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ sha256: string }>(
        "select sha256 from schema_migrations where name = $1",
        [name],
      );
      if (existing.rowCount) {
        if (existing.rows[0]?.sha256 !== sha256)
          throw new Error(`migration checksum mismatch: ${name}`);
        continue;
      }
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations(name, sha256) values ($1, $2)",
          [name, sha256],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client
      .query("select pg_advisory_unlock(67124401)")
      .catch(() => undefined);
    await client.end();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  await runMigrations(databaseUrl);
  process.stdout.write("database migrations: ok\n");
}
