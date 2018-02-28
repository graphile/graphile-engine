"use strict";
// @flow

if (parseFloat(process.versions.node) < 4) {
  throw new Error(
    "This library requires Node v4 or above; we've detected v${parseFloat(process.versions.node)}"
  );
}

const debug = require("debug")("pg-sql2");

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

export opaque type SQLNode = SQLRawNode | SQLValueNode | SQLIdentifierNode
export opaque type SQLQuery = Array<SQLNode>
export type SQL = SQLNode | SQLQuery;

type QueryConfig = {
  text: string,
  values: Array<mixed>
};
*/

function makeRawNode(text /*: string */) /*: SQLRawNode */ {
  if (typeof text !== "string") {
    throw new Error("Invalid argument to makeRawNode - expected string");
  }
  // $FlowFixMe: flow doesn't like symbols
  return { type: "RAW", text, [$$trusted]: true };
}

function isStringOrSymbol(val) {
  return typeof val === "string" || typeof val === "symbol";
}

function makeIdentifierNode(
  names /*: Array<string | Symbol> */
) /*: SQLIdentifierNode */ {
  if (!Array.isArray(names) || !names.every(isStringOrSymbol)) {
    throw new Error(
      "Invalid argument to makeIdentifierNode - expected array of strings/symbols"
    );
  }
  // $FlowFixMe
  return { type: "IDENTIFIER", names, [$$trusted]: true };
}

function makeValueNode(value /*: mixed */) /*: SQLValueNode */ {
  // $FlowFixMe
  return { type: "VALUE", value, [$$trusted]: true };
}

function ensureNonEmptyArray /*:: <T>*/(
  array /*: Array<T>*/,
  allowZeroLength = false
) /*: Array<T> */ {
  if (!Array.isArray(array)) {
    throw debugError(new Error("Expected array"));
  }
  if (!allowZeroLength && array.length < 1) {
    throw debugError(new Error("Expected non-empty array"));
  }
  for (let idx = 0, l = array.length; idx < l; idx++) {
    if (array[idx] == null) {
      throw debugError(
        new Error(`Array index ${idx} is ${String(array[idx])}`)
      );
    }
  }
  return array;
}

function compile(sql /*: SQLQuery | SQLNode */) /*: QueryConfig*/ {
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

  for (let i = 0, l = items.length; i < l; i++) {
    const rawItem = items[i];
    const item /*: SQLNode */ = enforceValidNode(rawItem);
    switch (item.type) {
      case "RAW":
        if (typeof item.text !== "string") {
          throw new Error("RAW node expected string");
        }
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
                // $FlowFixMe: flow doesn't like symbols
              } else if (typeof rawName === "symbol") {
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
              } else {
                throw debugError(
                  new Error(
                    `Expected string or symbol, received '${String(rawName)}'`
                  )
                );
              }
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

function enforceValidNode(node /*: mixed */) /*: SQLNode */ {
  // $FlowFixMe: flow doesn't like symbols
  if (node !== null && typeof node === "object" && node[$$trusted] === true) {
    // $FlowFixMe: this has been validated
    return node;
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
function query(
  strings /*: Array<string> */,
  ...values /*: Array<SQL> */
) /*: SQLQuery */ {
  if (!Array.isArray(strings)) {
    throw new Error(
      "sql.query should be used as a template literal, not a function call!"
    );
  }
  const items = [];
  for (let i = 0, l = strings.length; i < l; i++) {
    const text = strings[i];
    if (typeof text !== "string") {
      throw new Error(
        "sql.query should be used as a template literal, not a function call."
      );
    }
    if (text.length > 0) {
      items.push(makeRawNode(text));
    }
    if (values[i]) {
      const value = values[i];
      if (Array.isArray(value)) {
        const nodes /*: SQLQuery */ = value.map(enforceValidNode);
        items.push(...nodes);
      } else {
        const node /*: SQLNode */ = enforceValidNode(value);
        items.push(node);
      }
    }
  }
  return items;
}

/**
 * Creates a Sql item for some raw Sql text. Just plain ol‘ raw Sql. This
 * method is dangerous though because it involves no escaping, so proceed
 * with caution!
 */
function raw(text /*: string */) /*: SQLNode */ {
  return makeRawNode(String(text));
}

/**
 * Creates a Sql item for a Sql identifier. A Sql identifier is anything like
 * a table, schema, or column name. An identifier may also have a namespace,
 * thus why many names are accepted.
 */
function identifier(...names /*: Array<string | Symbol> */) /*: SQLNode */ {
  return makeIdentifierNode(ensureNonEmptyArray(names));
}

/**
 * Creates a Sql item for a value that will be included in our final query.
 * This value will be added in a way which avoids Sql injection.
 */
function value(val /*: mixed */) /*: SQLNode */ {
  return makeValueNode(val);
}

const trueNode = raw(`TRUE`);
const falseNode = raw(`FALSE`);
const nullNode = raw(`NULL`);

/**
 * If the value is simple will inline it into the query, otherwise will defer
 * to value.
 */
function literal(val /*: mixed */) /*: SQLNode */ {
  if (typeof val === "string" && val.match(/^[a-zA-Z0-9_-]*$/)) {
    return raw(`'${val}'`);
  } else if (typeof val === "number" && Number.isFinite(val)) {
    if (Number.isInteger(val)) {
      return raw(String(val));
    } else {
      return raw(`'${0 + val}'::float`);
    }
  } else if (typeof val === "boolean") {
    return val ? trueNode : falseNode;
  } else if (val == null) {
    return nullNode;
  } else {
    return makeValueNode(val);
  }
}

/**
 * Join some Sql items together seperated by a string. Useful when dealing
 * with lists of Sql items that doesn’t make sense as a Sql query.
 */
function join(
  items /*: Array<SQL> */,
  rawSeparator /*: string */ = ""
) /*: SQLQuery */ {
  ensureNonEmptyArray(items, true);
  if (typeof rawSeparator !== "string") {
    throw new Error("Invalid separator - must be a string");
  }
  const separator = rawSeparator;
  const currentItems = [];
  const sepNode = makeRawNode(separator);
  for (let i = 0, l = items.length; i < l; i++) {
    const rawItem /*: SQL */ = items[i];
    let itemsToAppend /*: SQLNode | SQLQuery */;
    if (Array.isArray(rawItem)) {
      itemsToAppend = rawItem.map(enforceValidNode);
    } else {
      itemsToAppend = [enforceValidNode(rawItem)];
    }
    if (i === 0 || !separator) {
      currentItems.push(...itemsToAppend);
    } else {
      currentItems.push(sepNode, ...itemsToAppend);
    }
  }
  return currentItems;
}

// Copied from https://github.com/brianc/node-postgres/blob/860cccd53105f7bc32fed8b1de69805f0ecd12eb/lib/client.js#L285-L302
// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
function escapeSqlIdentifier(str) {
  var escaped = '"';

  for (var i = 0, l = str.length; i < l; i++) {
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

exports.query = query;

exports.fragment = exports.query;

exports.raw = raw;

exports.identifier = identifier;

exports.value = value;

exports.literal = literal;

exports.join = join;

exports.compile = compile;

exports.null = nullNode;
exports.blank = exports.query``;
