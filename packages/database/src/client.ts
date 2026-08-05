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

export function createDatabasePool(
  connectionString: string,
  maximumConnections = 10,
): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: maximumConnections,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: "legacy-vault-api",
  });
}
