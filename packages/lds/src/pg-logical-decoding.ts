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

export default class PgLogicalDecoding extends EventEmitter {
  public connected: boolean = false;
  private config: pg.ClientConfig;
  private tablePattern: string;
  private slotName: string;
  private client: pg.Client;

  constructor(
    config: pg.ClientConfig,
    tablePattern = "*.*",
    slotName = "postgraphile"
  ) {
    super();
    this.config = config;
    this.tablePattern = tablePattern;
    this.slotName = slotName;
    this.createClient();
  }

  public connect(): Promise<void> {
    if (this.connected) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.client.connect(err => {
        if (err) {
          reject(err);
        }
        this.connected = true;
        resolve();
      });
    });
  }

  public async createSlot(): Promise<void> {
    await this.connect();
    try {
      await this.client.query(
        `SELECT pg_create_logical_replication_slot($1, 'wal2json')`,
        [this.slotName]
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
    await this.connect();
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

  /****************************************************************************/

  private createClient() {
    this.client = new pg.Client(this.config);
    this.client.on("error", this.onClientError);
  }

  private onClientError = (err: Error) => {
    this.connected = false;
    this.emit("error", err);
  };
}
