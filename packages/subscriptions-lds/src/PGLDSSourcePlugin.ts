/* tslint:disable no-console */
import { Plugin } from "postgraphile-core";
import * as WebSocket from "ws";
type SubscriptionReleaser = () => void;
type SubscriptionCallback = () => void;

class LDSLiveSource {
  private ws: WebSocket;
  private subscriptions: {
    [topic: string]: Array<SubscriptionCallback>;
  };

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on("open", () => {
      console.log("Connected to LDS server");
    });
    this.ws.on("message", this.handleMessage);
    this.subscriptions = {};
  }

  public subscribeCollection(
    callback: () => void,
    collectionIdentifier: any,
    predicate?: (record: any) => boolean
  ): SubscriptionReleaser | null {
    console.log("collection", collectionIdentifier.name, predicate, callback);

    return null;
  }

  public subscribeRecord(
    callback: () => void,
    collectionIdentifier: any,
    recordIdentifier: any
  ): SubscriptionReleaser | null {
    console.log("record", collectionIdentifier.name, recordIdentifier);
    return this.sub(
      JSON.stringify([
        collectionIdentifier.namespaceName,
        collectionIdentifier.name,
        recordIdentifier,
      ]),
      callback
    );
  }

  private sub(topic: string, cb: () => void) {
    if (!this.subscriptions[topic]) {
      this.subscriptions[topic] = [];
    }

    const newLength = this.subscriptions[topic].push(cb);
    if (newLength === 1) {
      this.ws.send("SUB " + topic);
    }

    let done = false;
    return () => {
      if (done) {
        return;
      }
      done = true;
      const i = this.subscriptions[topic].indexOf(cb);
      this.subscriptions[topic].splice(i, 1);
      this.ws.send("UNSUB " + topic);
    };
  }

  private handleMessage = (message: WebSocket.Data) => {
    try {
      const messageString = message.toString("utf8");
      const payload = JSON.parse(messageString);
      switch (payload._) {
        case "KA":
          // Keep alive, no action necessary.
          return;
        case "update":
          const { schema, table, key, data } = payload;
          const topic = JSON.stringify([schema, table, key]);
          const subs = this.subscriptions[topic];
          if (subs) {
            subs.forEach(s => s());
          }
          return;
        default:
          console.log("Unhandled message", payload);
      }
    } catch (e) {
      console.error("Error occurred when processing message", message);
      console.error(e);
    }
  };
}

const PgLDSSourcePlugin: Plugin = async function(
  builder,
  { pgLDSUrl = process.env.LDS_SERVER_URL }
) {
  if (typeof pgLDSUrl !== "string") {
    return;
  }
  // Connect to LDS server
  const source = new LDSLiveSource(pgLDSUrl);
  builder.hook("build", build => {
    build.liveCoordinator.registerSource("pg", source);
    return build;
  });
};

export default PgLDSSourcePlugin;
