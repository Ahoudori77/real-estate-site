import sql from "mssql";

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export async function getSqlPool(): Promise<sql.ConnectionPool> {
  if (poolPromise) {
    return poolPromise;
  }

  const connectionString = process.env.SQL_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error("SQL_CONNECTION_STRING is not set.");
  }

  poolPromise = new sql.ConnectionPool(connectionString)
    .connect()
    .catch((error: unknown) => {
      poolPromise = null;
      throw error;
    });

  return poolPromise;
}

export { sql };