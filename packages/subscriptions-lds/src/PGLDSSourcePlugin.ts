/* tslint:disable no-console */
import { Plugin } from "postgraphile-core";
import * as WebSocket from "ws";
type SubscriptionReleaser = () => void;
type SubscriptionCallback = () => void;
type Predicate = (record: any) => boolean;

class LDSLiveSource {
  private url: string;
  private reconnecting: boolean;
  private live: boolean;
  private subscriptions: {
    [topic: string]: Array<[SubscriptionCallback, Predicate | void]>;
  };
  private ws: WebSocket;

  constructor(url: string) {
    this.url = url;
    this.reconnecting = false;
    this.live = true;
    this.subscriptions = {};
    this.connect();
  }

  public subscribeCollection(
    callback: () => void,
    collectionIdentifier: any,
    predicate?: Predicate
  ): SubscriptionReleaser | null {
    return this.sub(
      JSON.stringify([
        collectionIdentifier.namespaceName,
        collectionIdentifier.name,
      ]),
      callback,
      predicate
    );
  }

  public subscribeRecord(
    callback: () => void,
    collectionIdentifier: any,
    recordIdentifier: any
  ): SubscriptionReleaser | null {
    return this.sub(
      JSON.stringify([
        collectionIdentifier.namespaceName,
        collectionIdentifier.name,
        recordIdentifier,
      ]),
      callback
    );
  }

  private connect() {
    this.ws = new WebSocket(this.url);
    this.ws.on("error", err => {
      console.error("Websocket error");
      console.error(err);
      this.reconnect();
    });
    this.ws.on("open", () => {
      // Resubscribe
      for (const topic of Object.keys(this.subscriptions)) {
        if (this.subscriptions[topic] && this.subscriptions[topic].length) {
          this.ws.send("SUB " + topic);
        }
      }
    });
    this.ws.on("message", this.handleMessage);
    this.ws.on("close", () => {
      if (this.live) {
        this.reconnect();
      }
    });
  }

  private reconnect() {
    if (this.reconnecting) {
      return;
    }
    this.reconnecting = true;
    setTimeout(() => {
      this.reconnecting = false;
      this.connect();
    }, 1000);
  }

  private sub(
    topic: string,
    cb: SubscriptionCallback,
    predicate?: Predicate | void
  ) {
    const entry: [SubscriptionCallback, Predicate | void] = [cb, predicate];
    if (!this.subscriptions[topic]) {
      this.subscriptions[topic] = [];
    }
    const newLength = this.subscriptions[topic].push(entry);
    if (newLength === 1) {
      this.ws.send("SUB " + topic);
    }

    let done = false;
    return () => {
      if (done) {
        console.warn("Double release?!");
        return;
      }
      done = true;
      const i = this.subscriptions[topic].indexOf(entry);
      this.subscriptions[topic].splice(i, 1);
      if (this.subscriptions[topic].length === 0) {
        this.ws.send("UNSUB " + topic);
      }
    };
  }

  private announce(topic: string, dataOrKey: any) {
    const subs = this.subscriptions[topic];
    if (subs) {
      subs.forEach(([callback, predicate]) => {
        if (predicate && !predicate(dataOrKey)) {
          return;
        }
        callback();
      });
    }
  }
  private handleMessage = (message: WebSocket.Data) => {
    try {
      const messageString = message.toString("utf8");
      const payload = JSON.parse(messageString);
      switch (payload._) {
        case "ACK":
          // Connected, no action necessary.
          return;
        case "KA":
          // Keep alive, no action necessary.
          return;
        case "insert": {
          const { schema, table, data } = payload;
          const topic = JSON.stringify([schema, table]);
          this.announce(topic, data);
          return;
        }
        case "update": {
          const { schema, table, key, data } = payload;
          const topic = JSON.stringify([schema, table, key]);
          this.announce(topic, data);
          return;
        }
        case "delete": {
          const { schema, table, key } = payload;
          const topic = JSON.stringify([schema, table, key]);
          this.announce(topic, key);
          return;
        }
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
  { pgLDSUrl = process.env.LDS_SERVER_URL || "ws://127.0.0.1:9876" }
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
