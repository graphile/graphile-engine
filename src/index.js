"use strict";
// @flow

if (parseFloat(process.versions.node) < 4) {
  throw new Error(
    "This library requires Node v4 or above; we've detected v${parseFloat(process.versions.node)}"
  );
}

const isSymbol = sym => typeof sym === "symbol";
const isNil = o => o === null || o === undefined;
const isObject = o => typeof o === "object";
const debug = require("debug")("pg-sql2");

const isDev = ["development"].indexOf(process.env.NODE_ENV) >= 0;

function debugError(err) {
  debug(err);
  return err;
}

const $$trusted = Symbol("trusted");
/*::
type SQLRawNode = {
  text: string,
  type: 'RAW',
}
type SQLIdentifierNode = {
  names: Array<mixed>,
  type: 'IDENTIFIER',
}
type SQLValueNode = {
  value: mixed,
  type: 'VALUE',
}

type SQLNode = SQLRawNode | SQLValueNode | SQLIdentifierNode
type SQLQuery = Array<SQLNode>

type QueryConfig = {
  text: string,
  values: Array<mixed>
};
*/

function makeTrustedNode /*:: <Node>*/(node /*: Node */) /*: Node */ {
  Object.defineProperty(node, $$trusted, {
    enumerable: false,
    configurable: false,
    value: true,
  });
  return node;
}

function makeRawNode(text /*: string */) /*: SQLRawNode */ {
  return makeTrustedNode({ type: "RAW", text });
}

function makeIdentifierNode(
  names /*: Array<mixed> */
) /*: SQLIdentifierNode */ {
  return makeTrustedNode({ type: "IDENTIFIER", names });
}

function makeValueNode(value /*: mixed */) /*: SQLValueNode */ {
  return makeTrustedNode({ type: "VALUE", value });
}

function ensureNonEmptyArray(array, allowZeroLength = false) {
  if (!Array.isArray(array)) {
    throw debugError(new Error("Expected array"));
  }
  if (array.length < 1 && !allowZeroLength) {
    throw debugError(new Error("Expected non-empty array"));
  }
  array.forEach((entry, idx) => {
    if (entry == null) {
      throw debugError(new Error(`Array index ${idx} is ${String(entry)}`));
    }
  });
  return array;
}

function compile(sql /*: SQLQuery | SQLNode */): QueryConfig {
  // Join this to generate the SQL query
  const sqlFragments = [];

  // Values hold the JavaScript values that are represented in the query
  // string by placeholders. They are eager because they were provided before
  // compile time.
  const values = [];

  // When we come accross a symbol in our identifier, we create a unique
  // alias for it that shouldn’t be in the users schema. This helps maintain
  // sanity when constructing large Sql queries with many aliases.
  let nextSymbolId = 0;
  const symbolToIdentifier = new Map();

  const items = Array.isArray(sql) ? sql : [sql];

  for (const rawItem of items) {
    const item /*: SQLNode */ = enforceValidNode(rawItem);
    switch (item.type) {
      case "RAW":
        sqlFragments.push(item.text);
        break;
      case "IDENTIFIER":
        if (item.names.length === 0)
          throw new Error("Identifier must have a name");

        sqlFragments.push(
          item.names
            .map(rawName => {
              if (typeof rawName === "string") {
                const name /*: string */ = rawName;
                return escapeSqlIdentifier(name);
              }
              if (!isSymbol(rawName)) {
                throw debugError(
                  new Error(
                    `Expected string or symbol, received '${String(rawName)}'`
                  )
                );
              }
              const name /*: Symbol */ = /*:: (*/ rawName /*: any) */;

              // Get the correct identifier string for this symbol.
              let identifier = symbolToIdentifier.get(name);

              // If there is no identifier, create one and set it.
              if (!identifier) {
                identifier = `__local_${nextSymbolId++}__`;
                symbolToIdentifier.set(name, identifier);
              }

              // Return the identifier. Since we create it, we won’t have to
              // escape it because we know all of the characters are safe.
              return identifier;
            })
            .join(".")
        );
        break;
      case "VALUE":
        values.push(item.value);
        sqlFragments.push(`$${values.length}`);
        break;
      default:
    }
  }

  const text = sqlFragments.join("");
  return {
    text,
    values,
  };
}

function enforceValidNode(node /*: mixed */): SQLNode {
  if (node != null && typeof node === "object") {
    const isRaw = node.type === "RAW" && typeof node.text === "string";
    const isIdentifier =
      node.type === "IDENTIFIER" &&
      Array.isArray(node.names) &&
      node.names.every(
        name => typeof name === "string" || typeof name === "symbol"
      );
    const isValue = node.type === "VALUE";

    // $FlowFixMe: flow doesn't like symbols here?
    const isTrusted = node[$$trusted] === true;
    if ((isRaw || isIdentifier || isValue) && isTrusted) {
      // $FlowFixMe: this has been validated
      return node;
    }
  }
  throw new Error(`Expected SQL item, instead received '${String(node)}'.`);
}

/**
 * A template string tag that creates a `Sql` query out of some strings and
 * some values. Use this to construct all PostgreSQL queries to avoid SQL
 * injection.
 *
 * Note that using this function, the user *must* specify if they are injecting
 * raw text. This makes a SQL injection vulnerability harder to create.
 */
function query(strings /*: mixed */, ...values /*: Array<mixed> */): SQLQuery {
  if (!Array.isArray(strings)) {
    throw new Error(
      "sql.query should be used as a template literal, not a function call!"
    );
  }
  return strings.reduce((items, text, i) => {
    if (typeof text !== "string") {
      throw new Error(
        "sql.query should be used as a template literal, not a function call."
      );
    }
    if (!values[i]) {
      return items.concat(makeRawNode(text));
    } else {
      const value = values[i];
      if (isDev) {
        // These errors don't give you additional safety, they just catch
        // mistakes earlier to aid debugging, so they're fine to disable in
        // production
        if (!Array.isArray(value) && !isObject(value)) {
          if (typeof value === "string") {
            throw new Error(
              `Raw string passed into SQL query: '${String(value)}'.`
            );
          } else if (typeof value === "number") {
            throw new Error(
              `Raw number passed into SQL query: '${String(value)}'.`
            );
          } else {
            throw new Error(
              `Invalid raw value passed into SQL query: '${String(value)}'.`
            );
          }
        }
      }
      if (Array.isArray(value)) {
        const nodes /*: SQLQuery */ = value.map(enforceValidNode);
        return items.concat(makeRawNode(text), nodes);
      } else {
        const node /*: SQLNode */ = enforceValidNode(value);
        return items.concat(makeRawNode(text), node);
      }
    }
  }, []);
}

/**
 * Creates a Sql item for some raw Sql text. Just plain ol‘ raw Sql. This
 * method is dangerous though because it involves no escaping, so proceed
 * with caution!
 */
const raw = (text /*: mixed */) => makeRawNode(String(text));

/**
 * Creates a Sql item for a Sql identifier. A Sql identifier is anything like
 * a table, schema, or column name. An identifier may also have a namespace,
 * thus why many names are accepted.
 */
const identifier = (...names /*: Array<mixed> */) =>
  makeIdentifierNode(ensureNonEmptyArray(names));

/**
 * Creates a Sql item for a value that will be included in our final query.
 * This value will be added in a way which avoids Sql injection.
 */
const value = (val /*: mixed */) => makeValueNode(val);

/**
 * If the value is simple will inline it into the query, otherwise will defer
 * to value.
 */
const literal = (val /*: mixed */) => {
  if (typeof val === "string" && val.match(/^[a-zA-Z0-9_-]*$/)) {
    return raw(`'${val}'`);
  } else if (typeof val === "number" && Number.isFinite(val)) {
    if (Number.isInteger(val)) {
      return raw(String(val));
    } else {
      return raw(`'${0 + val}'::float`);
    }
  } else if (typeof val === "boolean") {
    if (val) {
      return raw(`TRUE`);
    } else {
      return raw(`FALSE`);
    }
  } else if (isNil(val)) {
    return raw(`NULL`);
  } else {
    return makeValueNode(val);
  }
};

/**
 * Join some Sql items together seperated by a string. Useful when dealing
 * with lists of Sql items that doesn’t make sense as a Sql query.
 */
const join = (rawItems /*: mixed */, rawSeparator /*: mixed */ = "") => {
  if (!Array.isArray(rawItems)) {
    throw new Error("Items to join must be an array");
  }
  const items = rawItems;
  if (typeof rawSeparator !== "string") {
    throw new Error("Invalid separator - must be a string");
  }
  const separator = rawSeparator;
  return ensureNonEmptyArray(items, true).reduce((currentItems, rawItem, i) => {
    let item /*: SQLNode | SQLQuery */;
    if (Array.isArray(rawItem)) {
      item = rawItem.map(enforceValidNode);
    } else {
      item = enforceValidNode(rawItem);
    }
    if (i === 0 || !separator) {
      return currentItems.concat(item);
    } else {
      return currentItems.concat(makeRawNode(separator), item);
    }
  }, []);
};

// Copied from https://github.com/brianc/node-postgres/blob/860cccd53105f7bc32fed8b1de69805f0ecd12eb/lib/client.js#L285-L302
// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
function escapeSqlIdentifier(str) {
  var escaped = '"';

  for (var i = 0; i < str.length; i++) {
    var c = str[i];
    if (c === '"') {
      escaped += c + c;
    } else {
      escaped += c;
    }
  }

  escaped += '"';

  return escaped;
}

/*::
opaque type OpaqueSQLNode = SQLNode;
opaque type OpaqueSQLQuery = SQLQuery;
*/

// The types we export are stricter so people get the right hinting

exports.query = (
  strings /*: string[] */,
  ...values /*: Array<OpaqueSQLNode | OpaqueSQLQuery> */
): OpaqueSQLQuery => query(strings, ...values);

exports.fragment = exports.query;

exports.raw = (text /*: string */): OpaqueSQLNode => raw(text);

exports.identifier = (...names /*: Array<string | Symbol> */): OpaqueSQLNode =>
  identifier(...names);

exports.value = (val /*: mixed */): OpaqueSQLNode => value(val);
exports.literal = (val /*: mixed */): OpaqueSQLNode => literal(val);

exports.join = (
  items /*: Array<OpaqueSQLQuery | OpaqueSQLNode> */,
  separator /*: string */ = ""
): OpaqueSQLQuery => join(items, separator);

exports.compile = (sql /*: OpaqueSQLQuery */): QueryConfig => compile(sql);

exports.null = exports.literal(null);
exports.blank = exports.query``;
