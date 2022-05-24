const { assertSnapshotsMatch, runTestQuery } = require("../helpers-v5");
const { graphql } = require("graphql");
const { withPgClient, getServerVersionNum } = require("../helpers");
const { createPostGraphileSchema } = require("../..");
const { readdirSync, readFile: rawReadFile } = require("fs");
const { resolve: resolvePath } = require("path");
const { printSchema } = require("graphql/utilities");
const { makeExtendSchemaPlugin, gql } = require("graphile-utils");
const ToyCategoriesPlugin = require("../integration/ToyCategoriesPlugin");

function readFile(filename, encoding) {
  return new Promise((resolve, reject) => {
    rawReadFile(filename, encoding, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

const isNotNullish = t => t != null;

const queriesDir = `${__dirname}/../fixtures/queries`;
const queryFileNames = readdirSync(queriesDir);
const testsToSkip = [];
let queryResults = [];

const kitchenSinkData = () =>
  readFile(`${__dirname}/../kitchen-sink-data.sql`, "utf8");

const pg11Data = () => readFile(`${__dirname}/../pg11-data.sql`, "utf8");

const dSchemaComments = () =>
  readFile(`${__dirname}/../kitchen-sink-d-schema-comments.sql`, "utf8");

const ExtendedPlugin = makeExtendSchemaPlugin({
  typeDefs: gql`
    extend type Query {
      extended: Boolean
    }
  `,
  resolvers: {
    Query: {
      extended: () => true,
    },
  },
});

exports.assertSnapshotsMatch = assertSnapshotsMatch;
exports.runTestQuery = async (source, config, options) => {
  const schema = await withPgClient(async pgClient => {
    // A selection of omit/rename comments on the d schema
    await pgClient.query(await dSchemaComments());
    return createPostGraphileSchema(
      pgClient,
      config.schema ?? ["a", "b", "c"],
      {
        subscriptions: config.subscriptions,
        classicIds: config.classicIds,
        dynamicJson: config.dynamicJson,
        setofFunctionsContainNulls: config.setofFunctionsContainNulls,
        simpleCollections: config.simpleCollections,
        graphileBuildOptions: config.graphileBuildOptions,
        appendPlugins: [
          ExtendedPlugin,
          config.ToyCategoriesPlugin ? ToyCategoriesPlugin : null,
        ].filter(isNotNullish),
      }
    );
  });
  const onConnect = async pgClient => {
    // Add data to the client instance we are using.
    await pgClient.query(await kitchenSinkData());
    const serverVersionNum = await getServerVersionNum(pgClient);
    if (serverVersionNum >= 110000) {
      await pgClient.query(await pg11Data());
    }
    const contextValue = {};
    await pgClient.query("savepoint test");
    // if (gqlSchema === gqlSchemas.rbac) {
    //   await pgClient.query(
    //     "select set_config('role', 'postgraphile_test_visitor', true), set_config('jwt.claims.user_id', '3', true)"
    //   );
    // }
  };
  return runTestQuery(schema, source, config, {
    ...options,
    onConnect,
  });
};
