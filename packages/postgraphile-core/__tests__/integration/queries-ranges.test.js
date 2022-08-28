const { graphql } = require("graphql");
const { withPgClient } = require("../helpers");
const { createPostGraphileSchema } = require("../..");
const { readdirSync, readFile: rawReadFile } = require("fs");

let schema;

beforeAll(async () => {
  // Get a few GraphQL schema instance that we can query.
  schema = await withPgClient(async pgClient =>
    createPostGraphileSchema(pgClient, ["ranges"])
  );
});

function readFile(filename, encoding) {
  return new Promise((resolve, reject) => {
    rawReadFile(filename, encoding, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}
const kitchenSinkData = () =>
  readFile(`${__dirname}/../kitchen-sink-data.sql`, "utf8");

test("numeric range", () =>
  withPgClient(async pgClient => {
    await pgClient.query(await kitchenSinkData());
    const result = await graphql(
      schema,
      "{rangeTestById(id: 934) {num{start {value inclusive} end { value inclusive } }}}",
      null,
      {
        pgClient: pgClient,
      }
    );
    expect(result.errors).toBeFalsy();
    expect(result.data.rangeTestById.num).toEqual({
      start: {
        value: "-1234567890123456789.123456789012",
        inclusive: true,
      },
      end: {
        value: "1111111111111111111.111111111111",
        inclusive: false,
      },
    });
  }));

test("bigint range", () =>
  withPgClient(async pgClient => {
    await pgClient.query(await kitchenSinkData());
    const result = await graphql(
      schema,
      "{rangeTestById(id:934) {int8{start {value inclusive} end { value inclusive } }}}",
      null,
      {
        pgClient: pgClient,
      }
    );
    expect(result.errors).toBeFalsy();
    expect(result.data.rangeTestById.int8).toEqual({
      start: {
        value: "-98765432109876543",
        inclusive: true,
      },
      end: {
        value: "22222222222222222",
        inclusive: false,
      },
    });
  }));

test("ts range", () =>
  withPgClient(async pgClient => {
    await pgClient.query(await kitchenSinkData());
    const result = await graphql(
      schema,
      "{rangeTestById(id:934) {ts{start {value inclusive} }}}",
      null,
      {
        pgClient: pgClient,
      }
    );
    expect(result.errors).toBeFalsy();
    expect(result.data.rangeTestById.ts).toEqual({
      start: {
        value: "2019-01-10T21:45:56.356022",
        inclusive: true,
      },
    });
  }));

test("tstz range", () =>
  withPgClient(async pgClient => {
    await pgClient.query(await kitchenSinkData());
    const result = await graphql(
      schema,
      "{rangeTestById(id:934) {tstz{start {value inclusive} }}}",
      null,
      {
        pgClient: pgClient,
      }
    );
    expect(result.errors).toBeFalsy();
    expect(result.data.rangeTestById.tstz).toEqual({
      start: {
        value: "2019-01-10T17:45:56.356022-04:00",
        inclusive: true,
      },
    });
  }));
