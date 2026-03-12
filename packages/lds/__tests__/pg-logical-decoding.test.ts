import * as assert from "assert";
import * as pg from "pg";
import PgLogicalDecoding, { LdsOptions } from "../src/pg-logical-decoding";
import {
  tryDropSlot,
  DATABASE_URL,
  query,
  withLdAndClient,
  withLd,
} from "./helpers";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  // Give half a second to clean up the slot
  await sleep(500);
  const { rows: finalPgRows } = await query(
    "select * from pg_catalog.pg_replication_slots where slot_name = $1",
    [slotName]
  );
  expect(finalPgRows).toHaveLength(0);
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
    const {
      rows: [{ id }],
    } = await client.query(
      "insert into app_public.foo(name) values('temporary') returning id"
    );
    await ld.getChanges(); // clear changes from this insert
    const changes1 = await ld.getChanges();
    expect(changes1.length).toEqual(0);
    // Do something
    await client.query("update app_public.foo set name = $1 where id = $2", [
      "Hello World",
      id,
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
    expect(change.columnvalues[1]).toEqual("Hello World");
    expect(change.oldkeys).toBeTruthy();
    expect(typeof change.oldkeys).toEqual("object");
    expect(change.oldkeys.keynames).toEqual(["id"]);
    expect(change.oldkeys.keyvalues).toEqual([id]);

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

test("multiple notifications", () =>
  withLdAndClient(async (ld, client) => {
    const {
      rows: [{ id: id1 }, { id: id2 }],
    } = await client.query(
      "insert into app_public.foo(name) values('temporary1'), ('temporary2') returning id"
    );
    try {
      await client.query(
        `
        begin;
        -- NOTE: this string interpolation is safe because we're using ints, but
        -- NEVER do this in production code!!!
        delete from app_public.foo where id = ${id1};
        update app_public.foo set name = name || name where id = ${id2};
        update app_public.foo set name = name || name where id = ${id2};
        update app_public.foo set name = name || name where id = ${id2};
      `
      );
    } finally {
      await client.query("commit;");
    }
    await client.query("delete from app_public.foo where id = $1", [id2]);

    // Get first two changes
    const changes1 = await ld.getChanges(null, 2);
    expect(changes1.length).toEqual(2);
    const [
      {
        data: { change: statement1changes },
      },
      {
        data: { change: statement2changes },
      },
    ] = changes1;
    expect(statement1changes).toHaveLength(2);
    const [statement1change1, statement1change2] = statement1changes;
    if (statement1change1.kind !== "insert") {
      throw new Error("Unexpected type");
    }
    expect(statement1change1.columnvalues[1]).toEqual("temporary1");
    if (statement1change2.kind !== "insert") {
      throw new Error("Unexpected type");
    }
    expect(statement1change2.columnvalues[1]).toEqual("temporary2");

    expect(statement2changes).toHaveLength(4);
    const [
      statement2change1,
      statement2change2,
      statement2change3,
      statement2change4,
    ] = statement2changes;
    if (statement2change1.kind !== "delete") {
      throw new Error("Unexpected type");
    }
    if (statement2change2.kind !== "update") {
      throw new Error("Unexpected type");
    }
    if (statement2change3.kind !== "update") {
      throw new Error("Unexpected type");
    }
    if (statement2change4.kind !== "update") {
      throw new Error("Unexpected type");
    }
    expect(statement2change1.oldkeys.keyvalues[0]).toEqual(id1);
    expect(statement2change2.columnvalues[1]).toEqual("temporary2temporary2");
    expect(statement2change3.columnvalues[1]).toEqual(
      "temporary2temporary2temporary2temporary2"
    );
    expect(statement2change4.columnvalues[1]).toEqual(
      "temporary2temporary2temporary2temporary2temporary2temporary2temporary2temporary2"
    );

    // Get final change
    const changes2 = await ld.getChanges();
    expect(changes2.length).toEqual(1);
    const [
      {
        data: { change: statement3changes },
      },
    ] = changes2;
    expect(statement3changes).toHaveLength(1);
    const statement3change1 = statement3changes[0];
    if (statement3change1.kind !== "delete") {
      throw new Error("Unexpected type");
    }
    expect(statement3change1.schema).toEqual("app_public");
    expect(statement3change1.table).toEqual("foo");
    expect(statement3change1.oldkeys).toBeTruthy();
    expect(typeof statement3change1.oldkeys).toEqual("object");
    expect(statement3change1.oldkeys.keynames).toEqual(["id"]);
    expect(statement3change1.oldkeys.keyvalues).toEqual([id2]);

    const changes3 = await ld.getChanges();
    expect(changes3.length).toEqual(0);
  }));

describe("parse results for", () => {
  async function getUpdate(options: LdsOptions) {
    const {
      rows: [{ id }],
    } = await query(
      `insert into app_public.foo(name) values ('john doe') returning id;`
    );
    return withLd(async ld => {
      await query(
        `update app_public.foo set name = 'jane doe' where id = $1;`,
        [id]
      );
      const rows = await ld.getChanges();
      const change = rows[0].data.change[0];
      assert.strictEqual(change.kind, "update" as const);
      return {
        id,
        keys: ld.changeToPk(change),
        data: ld.changeToRecord(change),
        change,
      };
    }, options);
  }

  test("options without `types` should contain raw wal2json output", async () => {
    const { id, keys, data } = await getUpdate({});
    expect(keys).toEqual([id]);
    expect(data).toEqual({
      id,
      name: "jane doe",
      created_at: expect.any(String), // .stringMatching(isoDateRegex)
      updated_at: expect.any(String), // .stringMatching(isoDateRegex)
    });
  });
  test("options with `types` set to pg-types should parse output", async () => {
    const getTypeParser = jest.fn(pg.types.getTypeParser); // like jest.spyOn(pg.types, "getTypeParser") but not globally shared
    const { id, keys, data } = await getUpdate({
      types: { getTypeParser },
    });
    expect(keys).toEqual([id]);
    expect(data.name).toEqual("jane doe");
    expect(data.created_at).toEqual(expect.any(Date));
    expect(data.updated_at).toEqual(expect.any(Date));
    expect(getTypeParser).toHaveBeenCalledTimes(5);
    expect(getTypeParser.mock.calls).toEqual([
      // in changeToPk (id)
      [pg.types.builtins.INT4, "text"],
      // in changeToRecord (id, name, created_at, updated_at)
      [pg.types.builtins.INT4, "text"],
      [pg.types.builtins.TEXT, "text"],
      [pg.types.builtins.TIMESTAMPTZ, "text"],
      [pg.types.builtins.TIMESTAMPTZ, "text"],
    ]);
  });
  test("options with `include-type-oids` overwritten should not have been parsed by `types`", async () => {
    const getTypeParser = jest.fn();
    const { id, keys } = await getUpdate({
      types: { getTypeParser },
      params: { "include-type-oids": "f" },
    });
    expect(keys).toEqual([String(id)]); // `numeric-data-types-as-string` still enabled
    expect(getTypeParser).not.toHaveBeenCalled();
  });
  test("options with `types` set to pg-types should ignore numbers in output", async () => {
    const { id, keys, data } = await getUpdate({
      types: pg.types,
      params: { "numeric-data-types-as-string": "f" },
    });
    expect(keys).toEqual([id]);
    expect(data.name).toEqual("jane doe");
    expect(data.created_at).toEqual(expect.any(Date));
  });
  test("options with `include-pk` and `include-types` set the change should have the respective properties", async () => {
    const { change } = await getUpdate({
      params: { "include-pk": "t", "include-types": "t" },
    });
    expect(change.columntypes).toEqual([
      "integer",
      "text",
      "timestamp with time zone",
      "timestamp with time zone",
    ]);
    expect(change).toHaveProperty("pk");
    expect((change as any).pk.pknames).toEqual(["id"]);
  });
});
