const { gql } = require("graphile-utils");
const {
  createSchema,
  releaseSchema,
  liveTest,
  next,
  expectNoChange,
  resetDatabase,
} = require("../live_helpers.js");

beforeEach(() => resetDatabase());
beforeAll(() => createSchema());
afterAll(() => releaseSchema());

[true, false].forEach(simpleCollection => {
  describe(
    simpleCollection ? "simple collections" : "relay connections",
    () => {
      test("no filters", () =>
        liveTest(
          simpleCollection
            ? gql`
                subscription {
                  allUsersList {
                    name
                  }
                }
              `
            : gql`
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
            let getNodes = () =>
              simpleCollection
                ? data.data.allUsersList
                : data.data.allUsers.nodes;
            expect(getNodes()).toHaveLength(0);
            await pgClient.query(
              "insert into live_test.users (name, favorite_color) values ($1, $2), ($3, $4)",
              ["Alice", "red", "Bob", "green"]
            );
            data = await next(getLatest);
            expect(getNodes()).toHaveLength(2);
            await pgClient.query(
              "insert into live_test.users (name, favorite_color) values ($1, $2), ($3, $4)",
              ["Caroline", "red", "Dave", "blue"]
            );
            data = await next(getLatest);
            expect(getNodes()).toHaveLength(4);
          }
        ));

      test("simple filter", () =>
        liveTest(
          simpleCollection
            ? gql`
                subscription {
                  allUsersList(condition: { favoriteColor: "red" }) {
                    name
                  }
                }
              `
            : gql`
                subscription {
                  allUsers(condition: { favoriteColor: "red" }) {
                    nodes {
                      name
                    }
                  }
                }
              `,
          async (pgClient, getLatest) => {
            let data;
            data = await next(getLatest);
            let getNodes = () =>
              simpleCollection
                ? data.data.allUsersList
                : data.data.allUsers.nodes;
            expect(getNodes()).toHaveLength(0);
            await pgClient.query(
              "insert into live_test.users (name, favorite_color) values ($1, $2), ($3, $4)",
              ["Alice", "red", "Bob", "green"]
            );
            data = await next(getLatest);
            expect(getNodes()).toHaveLength(1);
            expect(getNodes().map(n => n.name)).toEqual(["Alice"]);
            await pgClient.query(
              "insert into live_test.users (name, favorite_color) values ($1, $2)",
              ["Caroline", "blue"]
            );
            await expectNoChange(getLatest);
          }
        ));
    }
  );
});
