// @flow
import sql from "pg-sql2";
import type { Plugin } from "graphile-build";
import { version } from "../../package.json";

const defaultPgColumnFilter = (_attr, _build, _context) => true;
type Keys = Array<{
  column: string,
  table: string,
  schema: ?string,
}>;

export function preventEmptyResult<O: { [key: string]: () => string }>(
  obj
): $ObjMap<O, <V>(V) => V> {
  return Object.keys(obj).reduce((memo, key) => {
    const fn = obj[key];
    memo[key] = (...args) => {
      const result = fn.apply(memo, args);
      if (typeof result !== "string" || result.length === 0) {
        const stringifiedArgs = require("util").inspect(args);
        throw new Error(
          `Inflector for '${key}' returned '${String(
            result
          )}'; expected non-empty string\n` +
            `See: https://github.com/graphile/graphile-build/blob/master/packages/graphile-build-pg/src/plugins/PgBasicsPlugin.js\n` +
            `Arguments passed to ${key}:\n${stringifiedArgs}`
        );
      }
      return result;
    };
    return memo;
  }, {});
}

export default (function PgBasicsPlugin(
  builder,
  {
    pgInflection,
    pgStrictFunctions = false,
    pgColumnFilter = defaultPgColumnFilter,
  }
) {
  builder.hook("build", build => {
    return build.extend(build, {
      graphileBuildPgVersion: version,
      pgSql: sql,
      pgInflection,
      pgStrictFunctions,
      pgColumnFilter,
    });
  });
}: Plugin);
