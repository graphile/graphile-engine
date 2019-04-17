const { gql } = require("graphile-utils");
const {
  createSchema,
  releaseSchema,
  liveTest,
  next,
} = require("./live_helpers.js");

beforeAll(() => createSchema());
afterAll(() => releaseSchema());

test("basic connection", () =>
  liveTest(
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
