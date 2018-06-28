import pg from "pg";
import { graphql, printSchema } from "graphql";
import { createPostGraphileSchema } from "postgraphile-core";
import { ExtendSchemaPlugin, gql } from "../src";

const clean = data => {
  if (Array.isArray(data)) {
    return data.map(clean);
  } else if (data && typeof data === "object") {
    return Object.keys(data).reduce((memo, key) => {
      const value = data[key];
      if (key === "id" && typeof value === "number") {
        memo[key] = "[id]";
      } else if (key === "nodeId" && typeof value === "string") {
        memo[key] = "[nodeId]";
      } else {
        memo[key] = clean(value);
      }
      return memo;
    }, {});
  } else {
    return data;
  }
};

function mockSendEmail() {
  return new Promise(resolve => setTimeout(resolve, 1));
}
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

it("allows us to easily extend a PG schema", async () => {
  const schema = await createPostGraphileSchema(pgPool, ["a"], {
    disableDefaultMutations: true,
    appendPlugins: [
      ExtendSchemaPlugin(build => {
        const { pgSql: sql } = build;
        return {
          typeDefs: gql`
            input RegisterUserInput {
              name: String!
              email: String!
              bio: String
            }

            type RegisterUserPayload {
              user: User @recurseDataGenerators
            }

            extend type Mutation {
              registerUser(input: RegisterUserInput!): RegisterUserPayload
            }
          `,
          resolvers: {
            Mutation: {
              async registerUser(
                _query,
                args,
                context,
                resolveInfo,
                { select }
              ) {
                const { pgClient } = context;
                await pgClient.query("begin");
                try {
                  const { rows: [user] } = await pgClient.query(
                    `insert into a.users(name, email, bio) values ($1, $2, $3) returning *`,
                    [args.input.name, args.input.email, args.input.bio]
                  );
                  const [row] = await select(
                    sql.fragment`a.users`,
                    (tableAlias, sqlBuilder) => {
                      sqlBuilder.where(
                        sql.fragment`${tableAlias}.id = ${sql.value(user.id)}`
                      );
                    }
                  );
                  await mockSendEmail(
                    args.input.email,
                    "Welcome to my site",
                    `You're user ${user.id} - thanks for being awesome`
                  );

                  await pgClient.query("commit");
                  return {
                    user: row,
                  };
                } catch (e) {
                  await pgClient.query("rollback");
                  throw e;
                }
              },
            },
          },
        };
      }),
    ],
  });
  const printedSchema = printSchema(schema);
  expect(printedSchema).toMatchSnapshot();
  const pgClient = await pgPool.connect();
  try {
    const { data, errors } = await graphql(
      schema,
      `
        mutation {
          user1: registerUser(
            input: { name: "Test User 1", email: "testuser1@example.com" }
          ) {
            user {
              nodeId
              id
              name
              email
              bio
            }
          }
          user2: registerUser(
            input: {
              name: "Test User 2"
              email: "testuser2@example.com"
              bio: "I have a bio!"
            }
          ) {
            user {
              nodeId
              id
              name
              email
              bio
            }
          }
        }
      `,
      null,
      { pgClient },
      {}
    );
    expect(errors).toBeFalsy();
    expect(clean(data)).toMatchSnapshot();
  } finally {
    pgClient.release();
  }
});
