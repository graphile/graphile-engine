/* tslint:disable no-console */
import PgLogicalDecoding, {
  changeToRecord,
  changeToPk,
} from "./pg-logical-decoding";

const CONNECTION_STRING = process.env.LD_DATABASE_URL;
const TABLE_PATTERN = process.env.LD_TABLE_PATTERN || "*.*";
const SLOT_NAME = process.env.LD_SLOT_NAME || "postgraphile";

const SLEEP_DURATION = Math.max(
  1,
  parseInt(process.env.LD_WAIT || "", 10) || 200
);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  let lastLsn: string | null = null;
  const client = new PgLogicalDecoding(
    {
      connectionString: CONNECTION_STRING,
    },
    TABLE_PATTERN,
    SLOT_NAME
  );

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
  function announce(topicParts: Array<string>, payload: {} | null = null) {
    console.log(topicParts.join("|"), payload);
  }
  while (true) {
    const rows = await client.getChanges(null, 500);
    if (rows.length) {
      for (const row of rows) {
        const {
          lsn,
          data: { change: changes },
        } = row;
        lastLsn = lsn || lastLsn;
        for (const change of changes) {
          const { kind, schema, table } = change;
          if (change.kind === "insert") {
            announce([schema, table], {
              kind,
              data: changeToRecord(change),
            });
          } else if (change.kind === "update") {
            announce([schema, table, ...changeToPk(change)], {
              kind,
              data: changeToRecord(change),
            });
          } else if (change.kind === "delete") {
            announce([schema, table, ...changeToPk(change)], {
              kind,
            });
          } else {
            console.warn("Did not understand change: ", change);
          }
        }
      }
    }
    await sleep(SLEEP_DURATION);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
