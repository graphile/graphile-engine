/*
MIT License

Copyright (c) 2017 Kibae Shin (nonunnet@gmail.com)
Copyright (c) 2019 Benjie Gillam (code@benjiegillam.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { EventEmitter } from "events";
import * as pg from "pg";

declare module "pg" {
  interface ConnectionConfig {
    replication?: string;
  }
}

type PgClient = pg.Client & {
  connection: any;
};

function standbyStatusUpdate(
  client: PgClient,
  upperWAL: number,
  lowerWAL: number,
  _msg = "nothing"
) {
  // Timestamp as microseconds since midnight 2000-01-01
  const now = Date.now() - 946080000000;
  const upperTimestamp = Math.floor(now / 4294967.296);
  const lowerTimestamp = Math.floor(now - upperTimestamp * 4294967.296);

  if (lowerWAL === 4294967295) {
    // [0xff, 0xff, 0xff, 0xff]
    upperWAL = upperWAL + 1;
    lowerWAL = 0;
  } else {
    lowerWAL = lowerWAL + 1;
  }

  const response = Buffer.alloc(34);
  response.fill(0x72); // 'r'

  // Last WAL Byte + 1 received and written to disk locally
  response.writeUInt32BE(upperWAL, 1);
  response.writeUInt32BE(lowerWAL, 5);

  // Last WAL Byte + 1 flushed to disk in the standby
  response.writeUInt32BE(upperWAL, 9);
  response.writeUInt32BE(lowerWAL, 13);

  // Last WAL Byte + 1 applied in the standby
  response.writeUInt32BE(upperWAL, 17);
  response.writeUInt32BE(lowerWAL, 21);

  // Timestamp as microseconds since midnight 2000-01-01
  response.writeUInt32BE(upperTimestamp, 25);
  response.writeUInt32BE(lowerTimestamp, 29);

  // If 1, requests server to respond immediately - can be used to verify connectivity
  response.writeInt8(0, 33);

  client.connection.sendCopyFromChunk(response);
}

type LogicalReplicationConfig = pg.ClientConfig;

interface GetChangesOptions {
  /** includeXids : include xid on BEGIN and COMMIT, default false */
  includeXids?: boolean;
  /** includeTimestamp : include timestamp on COMMIT, default false */
  includeTimestamp?: boolean;
}

export default class LogicalReplication extends EventEmitter {
  public static LoadPlugin = function(module: string): any {
    return require("./plugins/" + module);
  };

  public client: PgClient | null = null;
  public stopped = false;
  public config: LogicalReplicationConfig;

  private onAcknowledge: ((msg: { lsn: string }) => void) | null = null;

  constructor(config: LogicalReplicationConfig = {}) {
    super();
    this.config = {
      ...config,
      replication: "database",
    };
  }

  public getChanges(
    slotName: string,
    uptoLsn: string | null = null,
    option: GetChangesOptions = {},
    initialErrorCallback?: (err: Error) => void
  ) {
    let cb = initialErrorCallback || null;
    if (this.client) {
      this.client.end();
      this.client.removeAllListeners();
      this.client = null;
    }
    this.stopped = false;
    const client = new pg.Client(this.config) as PgClient;
    this.client = client;

    client.on("error", err => {
      this.emit("error", err);
    });

    client.connect(connectionError => {
      if (connectionError) {
        this.emit("error", connectionError);
        return;
      }

      let sql = `START_REPLICATION SLOT ${client.escapeIdentifier(
        slotName
      )} LOGICAL ${uptoLsn ? uptoLsn : "0/00000000"}`;
      const opts = [
        `"include-xids" '${option.includeXids === true ? "on" : "off"}'`,
        `"include-timestamp" '${
          option.includeTimestamp === true ? "on" : "off"
        }'`,
      ];
      sql += " (" + opts.join(" , ") + ")";

      client.query(sql, queryError => {
        if (queryError) {
          if (!this.stopped && cb) {
            cb(queryError);
            cb = null;
          }
        }
        cb = null;
      });

      if (this.onAcknowledge) {
        this.removeListener("acknowledge", this.onAcknowledge);
      }
      const onAcknowledge = (msg: { lsn: string }) => {
        const lsn = msg.lsn.split("/");
        if (this.client === client) {
          standbyStatusUpdate(
            client,
            parseInt(lsn[0], 16),
            parseInt(lsn[1], 16),
            "acknowledge"
          );
        }
      };
      this.onAcknowledge = onAcknowledge;
      client.connection.once("replicationStart", () => {
        // start
        this.emit("start", this);
        client.connection.on("copyData", (msg: { chunk: Buffer }) => {
          if (msg.chunk[0] === 0x77) {
            // XLogData
            const lsn =
              msg.chunk
                .readUInt32BE(1)
                .toString(16)
                .toUpperCase() +
              "/" +
              msg.chunk
                .readUInt32BE(5)
                .toString(16)
                .toUpperCase();
            this.emit("data", {
              lsn,
              log: msg.chunk.slice(25),
            });
            this.emit("acknowledge", { lsn });
          } else if (msg.chunk[0] === 0x6b) {
            // Primary keepalive message
            const lsn =
              msg.chunk
                .readUInt32BE(1)
                .toString(16)
                .toUpperCase() +
              "/" +
              msg.chunk
                .readUInt32BE(5)
                .toString(16)
                .toUpperCase();
            const timestamp = Math.floor(
              msg.chunk.readUInt32BE(9) * 4294967.296 +
                msg.chunk.readUInt32BE(13) / 1000 +
                946080000000
            );
            const shouldRespond = msg.chunk.readInt8(17);
            this.emit("heartbeat", {
              lsn,
              timestamp,
              shouldRespond,
            });
          } else {
            // tslint:disable-next-line no-console
            console.warn("Unknown message", msg.chunk[0]);
          }
        });

        this.on("acknowledge", onAcknowledge);
      });
    });
    return this;
  }

  public stop() {
    this.stopped = true;
    if (this.client) {
      this.client.removeAllListeners();
      this.client.end();
      this.client = null;
    }
  }
}
