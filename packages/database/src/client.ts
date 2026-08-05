import pg from "pg";

export function createDatabaseClient(
  connectionString: string,
  timeoutMillis = 5_000,
): pg.Client {
  return new pg.Client({
    connectionString,
    connectionTimeoutMillis: timeoutMillis,
  });
}
