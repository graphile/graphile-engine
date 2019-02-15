import PgLogicalDecoding from "../src/pg-logical-decoding";
import { tryDropSlot, DATABASE_URL, query, withLdAndClient } from "./helpers";

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

test("notified on insert", () =>
  withLdAndClient(async (ld, client) => {
    const changes1 = await ld.getChanges();
    expect(changes1.length).toEqual(0);
    // Do something
    await client.query("insert into app_public.foo(name) values ($1)", [
      "Hello World",
    ]);
    const changes2 = await ld.getChanges();
    expect(changes2.length).toEqual(1);
    const [
      {
        data: { change: change2changes },
      },
    ] = changes2;
    expect(change2changes).toHaveLength(1);
    const change = change2changes[0];
    if (change.kind !== "insert") {
      throw new Error("Unexpected type");
    }
    expect(change.schema).toEqual("app_public");
    expect(change.table).toEqual("foo");
    expect(change.columnvalues).toBeTruthy();
    expect(change.columnvalues).toHaveLength(4);

    const changes3 = await ld.getChanges();
    expect(changes3.length).toEqual(0);
  }));

test("notified on update", () =>
  withLdAndClient(async (ld, client) => {
    const changes1 = await ld.getChanges();
    expect(changes1.length).toEqual(0);
    // Do something
    await client.query("update app_public.foo set name = $1 where id = $2", [
      "Hello World",
      1,
    ]);
    const changes2 = await ld.getChanges();
    expect(changes2.length).toEqual(1);
    const [
      {
        data: { change: change2changes },
      },
    ] = changes2;
    expect(change2changes).toHaveLength(1);
    const change = change2changes[0];
    if (change.kind !== "update") {
      throw new Error("Unexpected type");
    }
    expect(change.schema).toEqual("app_public");
    expect(change.table).toEqual("foo");
    expect(change.columnvalues).toBeTruthy();
    expect(change.columnvalues).toHaveLength(4);
    expect(change.oldkeys).toBeTruthy();
    expect(typeof change.oldkeys).toEqual("object");
    expect(change.oldkeys.keynames).toEqual(["id"]);
    expect(change.oldkeys.keyvalues).toEqual([1]);

    const changes3 = await ld.getChanges();
    expect(changes3.length).toEqual(0);
  }));

test("notified on delete", () =>
  withLdAndClient(async (ld, client) => {
    const {
      rows: [{ id }],
    } = await client.query(
      "insert into app_public.foo(name) values('temporary') returning id"
    );
    await ld.getChanges(); // clear changes from this insert
    const changes1 = await ld.getChanges();
    expect(changes1.length).toEqual(0);
    // Do something
    await client.query("delete from app_public.foo where id = $1", [id]);
    const changes2 = await ld.getChanges();
    expect(changes2.length).toEqual(1);
    const [
      {
        data: { change: change2changes },
      },
    ] = changes2;
    expect(change2changes).toHaveLength(1);
    const change = change2changes[0];
    if (change.kind !== "delete") {
      throw new Error("Unexpected type");
    }
    expect(change.schema).toEqual("app_public");
    expect(change.table).toEqual("foo");
    expect(change.oldkeys).toBeTruthy();
    expect(typeof change.oldkeys).toEqual("object");
    expect(change.oldkeys.keynames).toEqual(["id"]);
    expect(change.oldkeys.keyvalues).toEqual([id]);

    const changes3 = await ld.getChanges();
    expect(changes3.length).toEqual(0);
  }));
