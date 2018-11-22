import { makeWrapResolversPlugin, makeChangeNullabilityPlugin } from "../";
import { graphql } from "graphql";
import { createPostGraphileSchema } from "postgraphile-core";
import pg from "pg";

let pgPool;

beforeAll(() => {
  pgPool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
  });
});

afterAll(() => {
  if (pgPool) {
    pgPool.end();
    pgPool = null;
  }
});

const makeSchemaWithPlugins = plugins =>
  createPostGraphileSchema(pgPool, ["a"], {
    disableDefaultMutations: true,
    appendPlugins: plugins,
  });

it("requests the required columns", async () => {
  const schema = await makeSchemaWithPlugins([
    makeChangeNullabilityPlugin({
      User: {
        email: true,
      },
    }),
    makeWrapResolversPlugin({
      User: {
        email: {
          requires: {
            siblingColumns: [{ column: "id", alias: "__user_id" }],
          },
          resolve(resolver, user, args, context, _resolveInfo) {
            if (context.jwtClaims.user_id !== user.__user_id) {
              return null; // Don't allow users to see other users' emails
            }
            return resolver();
          },
        },
      },
    }),
  ]);
  const pgClient = await pgPool.connect();
  await pgClient.query("begin");
  try {
    const result = await graphql(
      schema,
      `
        {
          allUsers {
            nodes {
              nodeId
              id
              email
            }
          }
        }
      `,
      null,
      {
        pgClient,
        jwtClaims: {
          user_id: 2,
        },
      }
    );
    expect(result.errors).toBeFalsy();
    result.data.allUsers.nodes.forEach(user => {
      if (user.id === 2) {
        expect(user.email).not.toBeNull();
      } else {
        expect(user.email).toBeNull();
      }
    });
    expect(result.data).toMatchInlineSnapshot(`
Object {
  "allUsers": Object {
    "nodes": Array [
      Object {
        "email": null,
        "id": 1,
        "nodeId": "WyJ1c2VycyIsMV0=",
      },
      Object {
        "email": "bob@example.com",
        "id": 2,
        "nodeId": "WyJ1c2VycyIsMl0=",
      },
      Object {
        "email": null,
        "id": 3,
        "nodeId": "WyJ1c2VycyIsM10=",
      },
    ],
  },
}
`);
  } finally {
    pgClient.query("rollback");
    pgClient.release();
  }
});
