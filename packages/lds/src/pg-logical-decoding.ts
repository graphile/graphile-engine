/* eslint-disable no-console */
import * as pg from "pg";
import { EventEmitter } from "events";
import FatalError from "./fatal-error";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

declare module "pg" {
  interface ClientConfig {
    replication?: string;
  }
}

/**
 * Beware: this may include more than the keys (e.g. if there is no index)
 */
interface Keys {
  keynames: Array<string>;
  keytypes?: Array<string>; // with `include-types` option (default true)
  keytypeoids?: Array<number>; // with `include-type-oids` option (default false)
  keyvalues: Array<any>;
}

interface Change {
  // https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L957
  schema: string;

  // https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L961
  table: string;
}

// https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L941-L949
export interface InsertChange extends Change {
  kind: "insert";

  // https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L969
  columnnames: Array<string>;
  columntypes?: Array<string>; // with `include-types` option (default true)
  columntypeoids?: Array<number>; // with `include-type-oids` option (default false)
  columnvalues: Array<any>;
}

export interface UpdateChange extends Change {
  kind: "update";

  // https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L973
  columnnames: Array<string>;
  columntypes?: Array<string>; // with `include-types` option (default true)
  columntypeoids?: Array<number>; // with `include-type-oids` option (default false)
  columnvalues: Array<any>;

  // https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L992-L1003
  oldkeys: Keys;
}

export interface DeleteChange extends Change {
  kind: "delete";

  // https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L1009-L1018
  oldkeys: Keys;
}

interface Payload {
  lsn: string;
  data: {
    change: Array<InsertChange | UpdateChange | DeleteChange>;
  };
}

const toLsnData = ([lsn, data]: [string, string]): Payload => ({
  lsn,
  data: JSON.parse(data),
});

export interface LdsOptions {
  /** The 'add-tables' wal2json parameter. Defaults to `*.*`. */
  tablePattern?: string;
  /** The [replication slot](https://www.postgresql.org/docs/current/logicaldecoding-explanation.html#LOGICALDECODING-REPLICATION-SLOTS) identifier. Defaults to `postgraphile`. */
  slotName?: string;
  /** Whether `.createSlot()` should create a temporary replication slot which will be limited to the `client` session and gets cleaned up automatically. Defaults to `false`. */
  temporary?: boolean;
  /** (Custom) [type parsers](https://node-postgres.com/features/queries#types) to deserialise the wal2json column string values. Pass `pg.types` to get the default type parsing. Defaults to `undefined`, that is raw values will get emitted. */
  types?: pg.CustomTypesConfig;
  /** Extra [parameters to be passed to wal2json](https://github.com/eulerto/wal2json?tab=readme-ov-file#parameters). Use e.g. `{'numeric-data-types-as-string', 't'}` to make the type parsers apply to numeric values. */
  params?: Partial<Record<string, string>>;
}

export default class PgLogicalDecoding extends EventEmitter {
  public readonly slotName: string;
  public readonly temporary: boolean;
  private readonly getChangesQueryText: string;
  private readonly parse: (value: any, typeOid: number) => any;
  private pool: pg.Pool | null;
  private client: Promise<pg.PoolClient> | null;

  constructor(connectionString: string, options?: LdsOptions) {
    super();
    const {
      tablePattern = "*.*",
      slotName = "postgraphile",
      temporary = false,
      types,
      params,
    } = options || {};
    this.slotName = slotName;
    this.temporary = temporary;
    const parametersSql = Object.entries({
      "add-tables": tablePattern != "*.*" ? tablePattern : null,
      "include-types": "f", // type names are unnecessary
      "include-type-oids": types ? "t" : null,
      "numeric-data-types-as-string": types ? "t" : null,
      ...params,
    })
      .flatMap(entry => (typeof entry[1] == "string" ? entry : []))
      .map(pg.Client.prototype.escapeLiteral)
      .join(", ");
    this.getChangesQueryText = `SELECT lsn, data FROM pg_catalog.pg_logical_slot_get_changes($1, $2, $3, ${parametersSql})`;
    this.parse = types
      ? (value: any, typeOid: number) => {
          if (value === null) return null;
          // wal2json always outputs `bool`s as boolean
          if (typeof value === "boolean") return value; // assert: typeOid === pg.types.builtins.BOOL
          // wal2json outputs numeric data as numbers, unless `numeric-data-types-as-string` is set
          if (typeof value === "number") return value;
          const parser = types.getTypeParser(typeOid, "text");
          return parser(value);
        }
      : (value, _) => value;
    // We just use the pool to get better error handling
    this.pool = new pg.Pool({
      connectionString,
      max: 1,
    });
    this.pool.on("error", this.onPoolError);
    this.client = null;
  }

  public async dropStaleSlots() {
    const client = await this.getClient();
    try {
      await client.query(
        `
          with deleted_slots as (
            delete from postgraphile_meta.logical_decoding_slots
            where last_checkin < now() - interval '1 hour'
            returning *
          )
          select pg_catalog.pg_drop_replication_slot(slot_name)
          from deleted_slots
          where exists (
            select 1
            from pg_catalog.pg_replication_slots
            where pg_replication_slots.slot_name = deleted_slots.slot_name
          )
        `
      );
    } catch (e) {
      if (e.code === "42P01") {
        // The `postgraphile_meta.logical_decoding_slots` table doesn't exist.
        // Ignore.
      } else {
        console.error("Error clearing stale slots:", e.message);
      }
    }
  }

  public async createSlot(): Promise<void> {
    const client = await this.getClient();
    await this.trackSelf(client);
    try {
      await client.query(
        `SELECT pg_catalog.pg_create_logical_replication_slot($1, 'wal2json', $2)`,
        [this.slotName, !!this.temporary]
      );
    } catch (e) {
      if (e.code === "58P01") {
        const err = new FatalError(
          "Couldn't create replication slot, seems you don't have wal2json installed? Error: " +
            e.message,
          e
        );
        throw err;
      } else {
        throw e;
      }
    }
  }

  public async getChanges(
    uptoLsn: string | null = null,
    uptoNchanges: number | null = null
  ): Promise<Array<Payload>> {
    const client = await this.getClient();
    await this.trackSelf(client);
    try {
      const { rows } = await client.query<[lsn: string, data: string]>({
        text: this.getChangesQueryText,
        values: [this.slotName, uptoLsn, uptoNchanges],
        rowMode: "array",
      });
      return rows.map(toLsnData);
    } catch (e) {
      if (e.code === "42704") {
        console.warn("Replication slot went away?");
        await this.createSlot();
        console.warn(
          "Recreated slot; retrying getChanges (no further output implies success)"
        );
        await sleep(500);
        return this.getChanges(uptoLsn, uptoNchanges);
      }
      throw e;
    }
  }

  public changeToRecord(
    change: InsertChange | UpdateChange
  ): Record<string, any> {
    const { columnnames, columnvalues, columntypeoids } = change;
    return columnnames.reduce<Record<string, any>>(
      columntypeoids
        ? (memo, name, i) => {
            memo[name] = this.parse(columnvalues[i], columntypeoids[i]);
            return memo;
          }
        : (memo, name, i) => {
            memo[name] = columnvalues[i];
            return memo;
          },
      {}
    );
  }

  public changeToPk(change: UpdateChange | DeleteChange): any[] {
    const { keyvalues, keytypeoids } = change.oldkeys;
    return keytypeoids
      ? keyvalues.map((value, i) => this.parse(value, keytypeoids[i]))
      : keyvalues;
  }

  public async close() {
    if (!this.temporary) {
      const client = await this.getClient();
      await client.query("select pg_catalog.pg_drop_replication_slot($1)", [
        this.slotName,
      ]);
      await client.query(
        "delete from postgraphile_meta.logical_decoding_slots where slot_name = $1",
        [this.slotName]
      );
    }
    if (this.client) {
      try {
        (await this.client).release();
      } catch (e) {
        /*noop*/
      }
      this.client = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  public async installSchema(): Promise<void> {
    const client = await this.getClient();
    await client.query(`
      create schema if not exists postgraphile_meta;
      create table if not exists postgraphile_meta.logical_decoding_slots (
        slot_name text primary key,
        last_checkin timestamptz not null default now()
      );
    `);
  }

  /****************************************************************************/

  private async getClient(): Promise<pg.PoolClient> {
    if (!this.pool) {
      throw new Error("Pool has been closed");
    }
    if (this.client) {
      return this.client;
    }
    this.client = this.pool.connect();
    return this.client.catch(e => {
      this.client = null;
      return Promise.reject(e);
    });
  }

  private onPoolError = (err: Error) => {
    if (this.client) {
      this.client
        .then(c => c.release(err))
        .catch(() => {
          // noop
        });
    }
    this.client = null;
    console.error("LDS pool error:", err.message);
    // this.emit("error", err);
  };

  private async trackSelf(
    client: pg.PoolClient,
    skipSchema = false
  ): Promise<void> {
    if (this.temporary) {
      // No need to track temporary replication slots
      return;
    }
    try {
      await client.query(
        `
        insert into postgraphile_meta.logical_decoding_slots(slot_name)
        values ($1)
        on conflict (slot_name)
        do update set last_checkin = now();
        `,
        [this.slotName]
      );
    } catch (e) {
      if (!skipSchema) {
        await this.installSchema();
        return this.trackSelf(client, true);
      } else {
        throw e;
      }
    }
  }
}
