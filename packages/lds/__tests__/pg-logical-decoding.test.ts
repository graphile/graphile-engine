import PgLogicalDecoding from "../src/pg-logical-decoding";
import * as pg from "pg";

const DATABASE_URL = "lds_test";

test("opens and closes cleanly", async () => {
  const ld = new PgLogicalDecoding(DATABASE_URL, {
    temporary: true,
  });
  await ld.close();
});

test("creates slot for itself, cleans itself up on close", async () => {
  const slotName = "testslot";
  await tryDropSlot(slotName);
  const ld = new PgLogicalDecoding(DATABASE_URL, {
    slotName,
  });
  await ld.dropStaleSlots();
  await ld.createSlot();
  const { rows: initialRows } = await query(
    "select * from postgraphile_meta.logical_decoding_slots"
  );
  expect(initialRows.length).toEqual(1);
  expect(initialRows[0].slot_name).toEqual(slotName);
  const { rows: initialPgRows } = await query(
    "select * from pg_catalog.pg_replication_slots where slot_name = $1",
    [slotName]
  );
  expect(initialPgRows.length).toEqual(1);
  await ld.close();
  const { rows: finalRows } = await query(
    "select * from postgraphile_meta.logical_decoding_slots"
  );
  expect(finalRows.length).toEqual(0);
  const { rows: finalPgRows } = await query(
    "select * from pg_catalog.pg_replication_slots where slot_name = $1",
    [slotName]
  );
  expect(finalPgRows.length).toEqual(0);
});

async function tryDropSlot(slotName: string) {
  try {
    await withClient(DATABASE_URL, pgClient =>
      pgClient.query("select pg_drop_replication_slot($1)", [slotName])
    );
  } catch (e) {
    // Noop
  }
}

async function withClient<T = void>(
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

async function query(text: string, values: Array<any> = []) {
  return withClient(DATABASE_URL, pgClient => pgClient.query(text, values));
}
