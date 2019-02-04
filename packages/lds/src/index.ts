/* tslint:disable no-console */
import LogicalReplication from "./logical-replication";

const CONNECTION_STRING = process.env.LD_DATABASE_URL;
const SLOT_NAME = process.env.LD_SLOT_NAME || "postgraphile";

const stream = new LogicalReplication({
  connectionString: CONNECTION_STRING,
});

const PluginTestDecoding = LogicalReplication.LoadPlugin(
  "output/test_decoding"
);

let lastLsn: string | null = null;
let active = false;
stream.on("data", (
  /*object*/ msg: { lsn: string | null; log: Buffer | null }
) => {
  lastLsn = msg.lsn || lastLsn;
  const log = (msg.log || "").toString("utf8");
  try {
    console.log(PluginTestDecoding.parse(log));
  } catch (e) {
    console.trace(log, e);
  }
});

stream.on("error", err => {
  // stream.stop();
  active = false;
  console.trace("Error #2", err);
  // Start again after a second
  setTimeout(getChanges, 1000);
});

function getChanges() {
  if (active) {
    throw new Error("Already active");
  }
  active = true;
  stream.getChanges(SLOT_NAME, null, {}, err => {
    if (err) {
      // stream.stop();
      active = false;
      console.trace("Logical replication initialize error", err);
      // Try again after a second
      setTimeout(getChanges, 1000);
    }
  });
}

getChanges();
// stream.stop();

// SELECT * FROM pg_create_logical_replication_slot('test_slot', 'test_decoding');
// SELECT pg_drop_replication_slot('test_slot');
