// It's helpful to see the full error stack
Error.stackTraceLimit = Infinity;

if (process.env.DEBUG) {
  // When debug is set, outputting the console logs makes the tests slow.
  jest.setTimeout(30000);
}

import { promises as fsp } from "fs";
import { formatSQLForDebugging } from "graphile-build-pg";
import {
  getOperationAST,
  parse,
  validate,
  validateSchema,
  execute,
  subscribe,
} from "graphql";
import { isAsyncIterable } from "iterall";
import JSON5 from "json5";
import { relative } from "path";
import { withPgClient } from "./helpers";

/**
 * We go beyond what Jest snapshots allow; so we have to manage it ourselves.
 * If UPDATE_SNAPSHOTS is set then we'll write updated snapshots, otherwise
 * we'll do the default behaviour of comparing to existing snapshots.
 */
export const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === "1";

/** Sorts two GraphQLError paths. */
const pathCompare = (path1, path2) => {
  const l = Math.min(path1.length, path2.length);
  for (let i = 0; i < l; i++) {
    const a = path1[i];
    const z = path2[i];
    if (typeof a === "number") {
      if (typeof z !== "number") {
        throw new Error("Type mismatch; expected number");
      }
      const v = a - z;
      if (v !== 0) {
        return v;
      }
    } else if (typeof a === "string") {
      if (typeof z !== "string") {
        throw new Error("Type mismatch; expected string");
      }
      const v = a.localeCompare(z);
      if (v !== 0) {
        return v;
      }
    } else {
      throw new Error("Unexpected type");
    }
  }
  return path1.length - path2.length;
};

export async function runTestQuery(
  schema,
  source,
  config,
  options = Object.create(null)
) {
  const schemaValidationErrors = validateSchema(schema);
  if (schemaValidationErrors.length > 0) {
    throw new Error(
      `Invalid schema: ${schemaValidationErrors.map(e => String(e)).join(",")}`
    );
  }
  const { variableValues } = config;
  const { path } = options;
  return withPgClient(async pgClient => {
    if (options.onConnect) {
      await options.onConnect(pgClient);
    }
    const queries = [];
    const oldQuery = pgClient.query;
    pgClient.query = function (...args) {
      queries.push(args[0].text ? args[0] : { text: args[0], values: args[1] });
      return oldQuery.apply(this, args);
    };
    try {
      // Return the result of our GraphQL query.
      const document = parse(source);
      const operationAST = getOperationAST(document, undefined);
      const operationType = operationAST.operation;
      const validationErrors = validate(schema, document);
      if (validationErrors.length > 0) {
        throw new Error(
          `Invalid operation document: ${validationErrors
            .map(e => String(e))
            .join(",")}`
        );
      }
      const contextValue = {
        pgClient,
      };
      const result =
        operationType === "subscription"
          ? await subscribe({
              schema,
              document,
              variableValues,
              contextValue,
            })
          : await execute({
              schema,
              document,
              variableValues,
              contextValue,
            });
      if (isAsyncIterable(result)) {
        let errors = undefined;
        // hasNext changes based on payload order; remove it.
        const originalPayloads = [];
        // Start collecting the payloads
        const promise = (async () => {
          for await (const entry of result) {
            const { hasNext, ...rest } = entry;
            if (Object.keys(rest).length > 0 || hasNext) {
              // Do not add the trailing `{hasNext: false}` entry to the snapshot
              originalPayloads.push(rest);
            }
            if (entry.errors) {
              if (!errors) {
                errors = [];
              }
              errors.push(...entry.errors);
            }
          }
        })();
        // In parallel to collecting the payloads, run the callback
        if (options.callback) {
          throw new Error("Unsupported in V4");
        }
        if (operationType === "subscription") {
          const iterator = result[Symbol.asyncIterator]();
          // Terminate the subscription
          iterator.return?.();
        }
        // Now wait for all payloads to have been collected
        await promise;
        // Now we're going to reorder the payloads so that they're always in a
        // consistent order for the snapshots.
        const sortPayloads = (payload1, payload2) => {
          const ONE_AFTER_TWO = 1;
          const ONE_BEFORE_TWO = -1;
          if (!payload1.path) {
            return 0;
          }
          if (!payload2.path) {
            return 0;
          }
          // Make it so we can assume payload1 has the longer (or equal) path
          if (payload2.path.length > payload1.path.length) {
            return -sortPayloads(payload2, payload1);
          }
          for (let i = 0, l = payload1.path.length; i < l; i++) {
            let key1 = payload1.path[i];
            let key2 = payload2.path[i];
            if (key2 === undefined) {
              return ONE_AFTER_TWO;
            }
            if (key1 === key2) {
              /* continue */
            } else if (typeof key1 === "number" && typeof key2 === "number") {
              const res = key1 - key2;
              if (res !== 0) {
                return res;
              }
            } else if (typeof key1 === "string" && typeof key2 === "string") {
              const res = key1.localeCompare(key2);
              if (res !== 0) {
                return res;
              }
            } else {
              throw new Error("Type mismatch");
            }
          }
          // We should do canonical JSON... but whatever.
          return JSON.stringify(payload1).localeCompare(
            JSON.stringify(payload2)
          );
        };
        const payloads = [
          originalPayloads[0],
          ...originalPayloads.slice(1).sort(sortPayloads),
        ];
        return {
          payloads,
          errors,
          queries,
          extensions: payloads[0].extensions,
        };
      } else {
        // Throw away symbol keys/etc
        const { data, errors, extensions } = JSON.parse(JSON.stringify(result));
        if (errors) {
          console.error(errors[0].originalError || errors[0]);
        }
        if (options.callback) {
          throw new Error(
            "Callback is only appropriate when operation returns an async iterable" +
              String(errors ? errors[0].originalError || errors[0] : "")
          );
        }
        return { data, errors, queries, extensions };
      }
    } finally {
      //eslint-disable-next-line require-atomic-updates
      pgClient.query = oldQuery;
      await pgClient.query("rollback to savepoint test");
    }
  });
}

/**
 * If UPDATE_SNAPSHOTS is set then wrotes the given snapshot to the given
 * filePath, otherwise it asserts that the snapshot matches the previous
 * snapshot.
 */
async function snapshot(actual, filePath) {
  let expected = null;
  try {
    expected = await fsp.readFile(filePath, "utf8");
  } catch (e) {
    /* noop */
  }
  if (expected == null || UPDATE_SNAPSHOTS) {
    if (expected !== actual) {
      console.warn(`Updated snapshot in '${filePath}'`);
      await fsp.writeFile(filePath, actual);
    }
  } else {
    expect(actual).toEqual(expected);
  }
}

const sqlSnapshotAliases = new Map();

let sqlSnapshotAliasCount = 0;

beforeEach(() => {
  sqlSnapshotAliases.clear();
  sqlSnapshotAliasCount = 0;
});

afterAll(() => {
  sqlSnapshotAliases.clear();
});

/**
 * Replace non-deterministic parts of the query with more deterministic
 * equivalents.
 */
function makeSQLSnapshotSafe(sql) {
  return sql.replace(/__cursor_[0-9]+__/g, t => {
    const substitute = sqlSnapshotAliases.get(t);
    if (substitute != null) {
      return substitute;
    } else {
      const sub = `__SNAPSHOT_CURSOR_${sqlSnapshotAliasCount++}__`;
      sqlSnapshotAliases.set(t, sub);
      return sub;
    }
  });
}

const UUID_REGEXP = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/**
 * Replaces non-deterministic parts of the response with more deterministic
 * equivalents.
 */
function makeResultSnapshotSafe(data, replacements) {
  if (Array.isArray(data)) {
    return data.map(entry => makeResultSnapshotSafe(entry, replacements));
  } else if (typeof data === "object") {
    if (data == null) {
      return data;
    }
    const keys = Object.keys(data);
    return keys.reduce((memo, key) => {
      memo[key] = makeResultSnapshotSafe(data[key], replacements);
      return memo;
    }, {});
  } else if (
    typeof data === "string" &&
    UUID_REGEXP.test(data) &&
    !data.includes("-0000-0000-")
  ) {
    const uuidNumber = replacements.uuid.has(data)
      ? replacements.uuid.get(data)
      : replacements.uuidCounter++;
    if (!replacements.uuid.has(data)) {
      replacements.uuid.set(data, uuidNumber);
    }
    return `<UUID ${uuidNumber}>`;
  } else {
    return data;
  }
}

function makePayloadSnapshotSafe(payload, replacements) {
  const p = { ...payload };
  delete p.extensions;
  return makeResultSnapshotSafe(p, replacements);
}

// This regexp extracted from https://github.com/chalk/ansi-regex MIT license
// Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
// Copyright (c) Benjie (https://twitter.com/benjie)
export const ANSI_REGEXP =
  // eslint-disable-next-line no-control-regex, no-useless-escape
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
function stripAnsi(str) {
  return str.replace(ANSI_REGEXP, "");
}

/**
 * Build the snapshot for the given mode ('only') and then assert it matches
 * (or store it).
 */
export const assertSnapshotsMatch = async (only, props) => {
  const { path, result, ext } = props;
  const basePath = path.replace(/\.test\.graphql$/, "");
  if (basePath === path) {
    throw new Error(`Failed to trim .test.graphql from '${path}'`);
  }
  const { data, payloads, queries, errors, extensions } = await result;
  const replacements = { uuid: new Map(), uuidCounter: 1 };
  if (only === "result") {
    const resultFileName = basePath + (ext || "") + ".json5";
    const processedResults = payloads
      ? payloads.map(payload => makePayloadSnapshotSafe(payload, replacements))
      : makePayloadSnapshotSafe(data, replacements);
    const formattedData =
      //prettier.format(
      JSON5.stringify(processedResults, {
        space: 2,
        quote: '"',
      }) + "\n";
    // , {
    //   parser: "json5",
    //   printWidth: 120,
    // });
    await snapshot(formattedData, resultFileName);
  } else if (only === "errors") {
    const errorsFileName = basePath + (ext || "") + ".errors.json5";
    const processedErrors = errors
      ? makeResultSnapshotSafe(errors, replacements).sort((e1, e2) => {
          return pathCompare(e1.path, e2.path);
        })
      : null;
    const formattedErrors = processedErrors //prettier.format(
      ? JSON5.stringify(processedErrors, null, 2)
      : "null";
    //   {
    //     parser: "json5",
    //     printWidth: 120,
    //   },
    // );
    await snapshot(formattedErrors, errorsFileName);
  } else if (only === "sql") {
    const sqlFileName = basePath + (ext || "") + ".sql";
    const formattedQueries = queries
      .map(q => makeSQLSnapshotSafe(stripAnsi(formatSQLForDebugging(q.text))))
      .join("\n\n");
    await snapshot(formattedQueries, sqlFileName);
  } else {
    throw new Error(
      `Unexpected argument to assertSnapshotsMatch; expected result|sql, received '${only}'`
    );
  }
};
