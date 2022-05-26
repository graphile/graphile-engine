import { assertSnapshotsMatch, runTestQuery, makeSchema } from "../helpers-v5";
import { readFile as rawReadFile } from "fs";
import { getServerVersionNum } from "../helpers";

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

const pg11Data = () => readFile(`${__dirname}/../pg11-data.sql`, "utf8");

exports.assertSnapshotsMatch = assertSnapshotsMatch;

exports.runTestQuery = async (source, config, options) => {
  const schema = await makeSchema(config);
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
