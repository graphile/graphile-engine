/* tslint:disable no-console */
import * as pg from "pg";
import { EventEmitter } from "events";
import FatalError from "./fatal-error";

declare module "pg" {
  interface ConnectionConfig {
    replication?: string;
  }
}

/**
 * Beware: this may include more than the keys (e.g. if there is no index)
 */
interface Keys {
  keynames: Array<string>;
  keytypes: Array<string>;
  keyvalues: Array<any>;
}

interface Change {
  // https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L957
  schema: string;

  // https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L961
  table: string;
}

// https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L941-L949
interface InsertChange extends Change {
  kind: "insert";

  // https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L969
  columnnames: Array<string>;
  columntypes: Array<string>;
  columnvalues: Array<any>;
}

interface UpdateChange extends Change {
  kind: "update";

  // https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L973
  columnnames: Array<string>;
  columntypes: Array<string>;
  columnvalues: Array<any>;

  // https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L992-L1003
  oldkeys: Keys;
}

interface DeleteChange extends Change {
  kind: "delete";

  // https://github.com/eulerto/wal2json/blob/f81bf7af09324da656be87dfd53d20741c01e1e0/wal2json.c#L1009-L1018
  oldkeys: Keys;
}

export const changeToRecord = (change: InsertChange | UpdateChange) => {
  const { columnnames, columnvalues } = change;
  return columnnames.reduce((memo, name, i) => {
    memo[name] = columnvalues[i];
    return memo;
  }, {});
};

export const changeToPk = (change: UpdateChange | DeleteChange) => {
  return change.oldkeys.keyvalues;
};

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

interface Options {
  tablePattern?: string;
  slotName?: string;
  temporary?: boolean;
}

export default class PgLogicalDecoding extends EventEmitter {
  public connected: boolean = false;
  private connectionString: string;
  private tablePattern: string;
  private slotName: string;
  private temporary: boolean;
  private client: pg.Client | null;

  constructor(connectionString: string, options?: Options) {
    super();
    this.connectionString = connectionString;
    const {
      tablePattern = "*.*",
      slotName = "postgraphile",
      temporary = false,
    } = options || {};
    this.tablePattern = tablePattern;
    this.slotName = slotName;
    this.temporary = temporary;
    this.createClient();
  }

  public async dropStaleSlots() {
    if (!this.client) {
      throw new Error("Client has been released");
    }
    try {
      await this.client.query(
        `
          with deleted_slots as (
            delete from postgraphile_meta.logical_decoding_slots
            where last_checkin < now() - interval '1 hour'
            returning *
          )
          select pg_drop_replication_slot(slot_name)
          from deleted_slots
          where exists (
            select 1
            from pg_catalog.pg_replication_slots
            where pg_replication_slots.slot_name = deleted_slots.slot_name
          )
        `
      );
    } catch (e) {
      console.error("Error clearing stale slots:");
      console.error(e);
    }
  }

  public async createSlot(): Promise<void> {
    const client = this.client;
    if (!client) {
      throw new Error("Client has been released");
    }
    await this.connect();
    try {
      await client.query(
        `SELECT pg_create_logical_replication_slot($1, 'wal2json', $2)`,
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
    if (!this.client) {
      throw new Error("Client has been released");
    }
    await this.connect();
    await this.trackSelf();
    try {
      const { rows } = await this.client.query({
        text: `SELECT lsn, data FROM pg_logical_slot_get_changes($1, $2, $3, 'add-tables', $4::text, 'format-version', '1')`,
        values: [this.slotName, uptoLsn, uptoNchanges, this.tablePattern],
        rowMode: "array",
      });
      return rows.map(toLsnData);
    } catch (e) {
      if (e.code === "42704") {
        console.warn("Replication slot went away?");
        await this.createSlot();
        console.warn("Recreated slot; retrying getChanges");
        return this.getChanges(uptoLsn, uptoNchanges);
      }
      throw e;
    }
  }

  public close() {
    if (!this.client) {
      return;
    }
    this.client.end();
    this.client = null;
  }

  /****************************************************************************/

  private createClient() {
    this.client = new pg.Client({ connectionString: this.connectionString });
    this.client.on("error", this.onClientError);
  }

  private onClientError = (err: Error) => {
    console.log("client error", err);
    this.connected = false;
    this.emit("error", err);
  };

  private connect(): Promise<void> {
    if (this.connected) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      if (!this.client) {
        throw new Error("Client has been released");
      }
      this.client.connect(err => {
        if (err) {
          reject(err);
        }
        this.connected = true;
        resolve(this.trackSelf());
      });
    });
  }

  private async installSchema(): Promise<void> {
    if (!this.client) {
      throw new Error("Client has been released");
    }
    await this.client.query(`
      create schema if not exists postgraphile_meta;
      create table if not exists postgraphile_meta.logical_decoding_slots (
        slot_name text primary key,
        last_checkin timestamptz not null default now()
      );
    `);
  }

  private async trackSelf(skipSchema = false): Promise<void> {
    if (this.temporary) {
      // No need to track temporary replication slots
      return;
    }
    const client = this.client;
    if (!client) {
      throw new Error("Client has been released");
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
        return this.trackSelf(true);
      } else {
        throw e;
      }
    }
  }
}
