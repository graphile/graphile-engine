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

const SHARED_JWT_SECRET =
  "This is static for the tests, use a better one if you set one!";

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
    const serverVersionNum = await getServerVersionNum(pgClient);
    if (serverVersionNum < 110000 && config.pg11) {
      return null;
    }

    await pgClient.query(await dSchemaComments());

    if (config.ignoreRBAC === false) {
      await pgClient.query("set role postgraphile_test_authenticator");
    }

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
        ignoreRBAC: config.ignoreRBAC,
        jwtPgTypeIdentifier: config.jwtPgTypeIdentifier,
        jwtSecret:
          config.jwtSecret === true ? SHARED_JWT_SECRET : config.jwtSecret,
        appendPlugins: [
          ExtendedPlugin,
          config.ToyCategoriesPlugin ? ToyCategoriesPlugin : null,
        ].filter(isNotNullish),
      }
    );
  });
  if (!schema) {
    return null;
  }
  const onConnect = async pgClient => {
    // Load test data
    await pgClient.query(await kitchenSinkData());
    const serverVersionNum = await getServerVersionNum(pgClient);
    if (serverVersionNum >= 110000) {
      await pgClient.query(await pg11Data());
    }
    if (config.ignoreRBAC === false) {
      await pgClient.query(
        "select set_config('role', 'postgraphile_test_visitor', true), set_config('jwt.claims.user_id', '3', true)"
      );
    }
  };
  return runTestQuery(schema, source, config, {
    ...options,
    onConnect,
  });
};
