import PgLogicalDecoding from "../src/pg-logical-decoding";
import { tryDropSlot, DATABASE_URL, query } from "./helpers";

test("opens and closes cleanly", async () => {
  const ld = new PgLogicalDecoding(DATABASE_URL, {
    temporary: true,
  });
  await ld.close();
});

test("default creates slot for itself, cleans itself up on close", async () => {
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

test("temporary creates slot for itself, PostgreSQL automatically cleans up for us", async () => {
  const slotName = "testslot2";
  await tryDropSlot(slotName);
  const ld = new PgLogicalDecoding(DATABASE_URL, {
    slotName,
    temporary: true,
  });
  await ld.installSchema();
  await ld.dropStaleSlots();
  await ld.createSlot();
  const { rows: initialRows } = await query(
    "select * from postgraphile_meta.logical_decoding_slots"
  );
  expect(initialRows.length).toEqual(0);
  const { rows: initialPgRows } = await query(
    "select * from pg_catalog.pg_replication_slots where slot_name = $1",
    [slotName]
  );
  expect(initialPgRows.length).toEqual(1);
  await ld.close();
  const { rows: finalPgRows } = await query(
    "select * from pg_catalog.pg_replication_slots where slot_name = $1",
    [slotName]
  );
  expect(finalPgRows.length).toEqual(0);
});
