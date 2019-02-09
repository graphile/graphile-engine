/* tslint:disable no-console curly */
import PgLogicalDecoding, {
  changeToRecord,
  changeToPk,
} from "./pg-logical-decoding";

export interface Options {
  slotName?: string;
  tablePattern?: string;
  sleepDuration?: number;
}

interface CollectionAnnouncement {
  schema: string;
  table: string;
}
interface RowAnnouncement {
  schema: string;
  table: string;
  keys: Array<string>;
}

export interface InsertCollectionAnnouncement extends CollectionAnnouncement {
  _: "insertC";
  data: {};
}
export interface UpdateCollectionAnnouncement extends CollectionAnnouncement {
  _: "updateC";
  data: {};
}
export interface UpdateRowAnnouncement extends RowAnnouncement {
  _: "update";
  data: {};
}
export interface DeleteRowAnnouncement extends RowAnnouncement {
  _: "delete";
}

export type Announcement =
  | InsertCollectionAnnouncement
  | UpdateCollectionAnnouncement
  | UpdateRowAnnouncement
  | DeleteRowAnnouncement;

export type AnnounceCallback = (announcement: Announcement) => void;

export interface LDSubscription {
  close(): void;
}

export default async function subscribeToLogicalDecoding(
  connectionString: string,
  callback: AnnounceCallback,
  options: Options = {}
): Promise<LDSubscription> {
  const {
    slotName = "postgraphile",
    tablePattern = "*.*",
    sleepDuration = 200,
  } = options;
  let lastLsn: string | null = null;
  const client = new PgLogicalDecoding(connectionString, {
    tablePattern,
    slotName,
  });

  try {
    await client.createSlot();
  } catch (e) {
    if (e.fatal) {
      throw e;
    } else if (e.code === "42710") {
      // Slot already exists; ignore.
    } else {
      console.trace(e);
    }
  }

  async function loop() {
    const rows = await client.getChanges(null, 500);
    if (rows.length) {
      for (const row of rows) {
        const {
          lsn,
          data: { change: changes },
        } = row;
        lastLsn = lsn || lastLsn;
        for (const change of changes) {
          const { schema, table } = change;
          if (change.kind === "insert") {
            const announcement: InsertCollectionAnnouncement = {
              _: "insertC",
              schema,
              table,
              data: changeToRecord(change),
            };
            callback(announcement);
          } else if (change.kind === "update") {
            const rowAnnouncement: UpdateRowAnnouncement = {
              _: "update",
              schema,
              table,
              keys: changeToPk(change),
              data: changeToRecord(change),
            };
            callback(rowAnnouncement);
            const collectionAnnouncement: UpdateCollectionAnnouncement = {
              _: "updateC",
              schema,
              table,
              data: changeToRecord(change),
            };
            callback(collectionAnnouncement);
          } else if (change.kind === "delete") {
            const announcement: DeleteRowAnnouncement = {
              _: "delete",
              schema,
              table,
              keys: changeToPk(change),
            };
            callback(announcement);
          } else {
            console.warn("Did not understand change: ", change);
          }
        }
      }
    }
    setTimeout(loop, sleepDuration);
  }
  loop();
  return {
    close: () => {
      throw new Error("Not implemented yet");
    },
  };
}
