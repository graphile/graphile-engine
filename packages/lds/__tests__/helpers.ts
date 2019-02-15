import * as pg from "pg";
export const DATABASE_URL = "lds_test";

export async function tryDropSlot(slotName: string) {
  try {
    await withClient(DATABASE_URL, pgClient =>
      pgClient.query("select pg_drop_replication_slot($1)", [slotName])
    );
  } catch (e) {
    // Noop
  }
}

export async function withClient<T = void>(
  connectionString: string,
  callback: (pgClient: pg.PoolClient) => Promise<T>
): Promise<T> {
  const pool = new pg.Pool({
    connectionString,
  });
  try {
    const client = await pool.connect();
    try {
      return await callback(client);
    } finally {
      await client.release();
    }
  } finally {
    await pool.end();
  }
}

export async function query(text: string, values: Array<any> = []) {
  return withClient(DATABASE_URL, pgClient => pgClient.query(text, values));
}
