/* tslint:disable no-console curly */
import PgLogicalDecoding, {
  changeToRecord,
  changeToPk,
} from "./pg-logical-decoding";

import * as WebSocket from "ws";

const stringify = JSON.stringify;

const CONNECTION_STRING = process.env.LD_DATABASE_URL;
const TABLE_PATTERN = process.env.LD_TABLE_PATTERN || "*.*";
const SLOT_NAME = process.env.LD_SLOT_NAME || "postgraphile";
const PORT =
  parseInt(process.env.LD_PORT || process.env.PORT || "", 10) || 9876;

// Maximum number of expected clients
const SLOTS = parseInt(process.env.LD_SLOTS || "", 10) || 50;

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

  // Now slot is created, create websocket server
  const wss = new WebSocket.Server({ port: PORT });
  const clients: Array<WebSocket> = [];
  const channels: {
    [schema: string]: {
      [table: string]: {
        [stringifiedKey: string]: Array<WebSocket | null>;
      };
    };
  } = {};

  // Send keepalive every 25 seconds
  setInterval(() => {
    clients.forEach(ws =>
      ws.send(
        JSON.stringify({
          kind: "KA",
        })
      )
    );
  }, 25000);

  wss.on("connection", function connection(ws) {
    ws.on("message", function incoming(rawMessage) {
      const message = rawMessage.toString("utf8");
      let topicJSON: string;
      let sub: boolean;
      if (message.startsWith("SUB ")) {
        topicJSON = message.substr(4);
        sub = true;
      } else if (message.startsWith("UNSUB ")) {
        topicJSON = message.substr(6);
        sub = false;
      } else {
        console.error("Unknown command", message);
        return;
      }
      const topic = JSON.parse(topicJSON);
      if (!Array.isArray(topic)) return console.error("Not an array");
      if (topic.length < 2) return console.error("Too short");
      if (topic.length > 3) return console.error("Too long");
      const [schema, table, key] = topic;
      if (typeof schema !== "string")
        return console.error("Schema not a string");
      if (typeof table !== "string") return console.error("Table not a string");
      if (
        key &&
        (!Array.isArray(key) || key.some((s: unknown) => typeof s !== "string"))
      )
        return console.error("Invalid key spec");

      const stringifiedKey = stringify(key);
      if (!channels[schema]) {
        channels[schema] = {};
      }
      if (!channels[schema][table]) {
        channels[schema][table] = {};
      }
      if (!channels[schema][table][stringifiedKey]) {
        channels[schema][table][stringifiedKey] = new Array(SLOTS);
      }
      const sockets = channels[schema][table][stringifiedKey]!;
      const i = sockets.indexOf(ws);
      if (sub) {
        if (i >= 0) {
          console.error("Socket is already registered for ", stringifiedKey);
          return;
        }
        const emptyIndex = sockets.findIndex(s => !s);
        if (emptyIndex < 0) {
          console.error("All sockets are full");
          return;
        }
        sockets[emptyIndex] = ws;
      } else {
        if (i < 0) {
          console.error("Socket is not registered for ", stringifiedKey);
          return;
        }
        sockets[i] = null;
      }
    });

    clients.push(ws);
    ws.on("close", () => {
      const i = clients.indexOf(ws);
      if (i >= 0) {
        clients.splice(i, 1);
      }
    });
    ws.send(
      JSON.stringify({
        kind: "ACK",
      })
    );
  });

  function announce(
    [schema, table, key]: [string, string] | [string, string, Array<string>],
    {
      kind,
      data = null,
    }: { kind: "insert" | "update" | "delete"; data?: {} | null }
  ) {
    if (!channels[schema] || !channels[schema][table]) return;
    const stringifiedKey = stringify(key);
    const sockets = channels[schema][table][stringifiedKey];
    if (!sockets) return;
    for (const socket of sockets) {
      if (socket) {
        socket.send(
          JSON.stringify({
            kind,
            schema,
            table,
            key,
            data,
          })
        );
      }
    }
    if (kind === "delete") {
      delete channels[schema][table][stringifiedKey];
    }
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
            announce([schema, table, changeToPk(change)], {
              kind,
              data: changeToRecord(change),
            });
          } else if (change.kind === "delete") {
            announce([schema, table, changeToPk(change)], {
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
