const { subscribe } = require("graphql");
const { withTransactionlessPgClient } = require("../helpers");
const { createPostGraphileSchema } = require("../..");
const { default: SubscriptionsLDS } = require("@graphile/subscriptions-lds");
const { gql } = require("graphile-utils");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let schema;

// Reset DB
beforeEach(() =>
  withTransactionlessPgClient(pgClient =>
    pgClient.query("delete from live_test.users")
  ));

beforeAll(() =>
  withTransactionlessPgClient(async pgClient => {
    schema = await createPostGraphileSchema(pgClient, "live_test", {
      live: true,
      ownerConnectionString: process.env.TEST_DATABASE_URL,
      appendPlugins: [SubscriptionsLDS],
    });
  }));

afterAll(() => {
  // Release the LDS source
  if (
    schema &&
    schema.__pgLdsSource &&
    typeof schema.__pgLdsSource.close === "function"
  ) {
    schema.__pgLdsSource.close();
  }
});

const withLive = (query, cb) =>
  withTransactionlessPgClient(async pgClient => {
    const iterator = await subscribe(schema, query, null, { pgClient });
    if (iterator.errors) {
      // Not actually an iterator
      throw iterator.errors[0].originalError || iterator.errors[0];
    }
    let changes = [];
    let ended = false;
    let error = null;
    function getChanges() {
      let values = changes;
      changes = [];
      return {
        values,
        ended,
        error,
      };
    }
    (async () => {
      try {
        /*
        for await (const value of iterator) {
          changes.push(value);
        }
        */
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await iterator.next();
          if (done) {
            break;
          } else {
            changes.push(value);
          }
        }
      } catch (e) {
        error = e;
      }
      ended = true;
    })();
    try {
      await cb(pgClient, getChanges);
    } finally {
      iterator.return();
    }
  });

async function next(getLatest, duration = 5000) {
  const start = Date.now();
  while (Date.now() - start <= duration) {
    const { values, ended, error } = getLatest();
    if (error) throw error;
    if (ended) throw new Error("Iterator has ended");
    if (values.length > 1) {
      throw new Error("Expected 1 value, got " + values.length);
    }
    if (values.length === 1) {
      return values[0];
    }
    await sleep(500);
  }
  throw new Error("Timeout");
}

test("test one", () =>
  withLive(
    gql`
      subscription {
        allUsers {
          nodes {
            name
          }
        }
      }
    `,
    async (pgClient, getLatest) => {
      let data;
      data = await next(getLatest);
      expect(data.data.allUsers.nodes).toHaveLength(0);
      await pgClient.query(
        "insert into live_test.users (name, favorite_color) values ($1, $2), ($3, $4)",
        ["Alice", "red", "Bob", "green"]
      );
      data = await next(getLatest);
      expect(data.data.allUsers.nodes).toHaveLength(2);
    }
  ));
