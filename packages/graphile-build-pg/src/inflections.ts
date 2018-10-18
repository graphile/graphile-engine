// @flow
/*
  DO NOT USE THIS FILE!
  It's being removed in v5 and is already heavily deprecated.
*/
import {
  upperCamelCase as baseUpperCamelCase,
  camelCase as baseCamelCase,
  constantCase as baseConstantCase,
  pluralize as basePluralize,
  singularize as baseSingularize,
} from "graphile-build";

import { preventEmptyResult } from "./plugins/PgBasicsPlugin";

type Keys = Array<{
  column: string;
  table: string;
  schema?: string;
}>;

interface InflectorUtils {
  constantCase: (str: string) => string;
  camelCase: (str: string) => string;
  upperCamelCase: (str: string) => string;
  pluralize: (str: string) => string;
  singularize: (str: string) => string;
}

export const defaultUtils: InflectorUtils = {
  constantCase: baseConstantCase,
  camelCase: baseCamelCase,
  upperCamelCase: baseUpperCamelCase,
  pluralize: basePluralize,
  singularize: baseSingularize,
};

export interface Inflector {
  // TODO: tighten this up!
  // eslint-disable-next-line flowtype/no-weak-types
  [key: string]: (...input: Array<any>) => string;
}

export const newInflector = (
  overrides: { [key: string]: () => string } | void = undefined,
  {
    constantCase,
    camelCase,
    upperCamelCase,
    pluralize,
    singularize,
  }: InflectorUtils = defaultUtils
): Inflector => {
  function singularizeTable(tableName: string): string {
    return singularize(tableName).replace(
      /.(?:(?:[_-]i|I)nput|(?:[_-]p|P)atch)$/,
      "$&_record"
    );
  }

  return preventEmptyResult({
    pluralize,
    argument(name: string | null, index: number) {
      return camelCase(name || `arg${index}`);
    },
    orderByType(typeName: string) {
      return upperCamelCase(`${pluralize(typeName)}-order-by`);
    },
    orderByEnum(
      name: string,
      ascending: boolean,
      _table: string,
      _schema: string | null
    ) {
      return constantCase(`${name}_${ascending ? "asc" : "desc"}`);
    },
    domainType(name: string) {
      return upperCamelCase(name);
    },
    enumName(inValue: string) {
      let value = inValue;

      if (value === "") {
        return "_EMPTY_";
      }

      // Some enums use asterisks to signify wildcards - this might be for
      // the whole item, or prefixes/suffixes, or even in the middle.  This
      // is provided on a best efforts basis, if it doesn't suit your
      // purposes then please pass a custom inflector as mentioned below.
      value = value
        .replace(/\*/g, "_ASTERISK_")
        .replace(/^(_?)_+ASTERISK/, "$1ASTERISK")
        .replace(/ASTERISK_(_?)_*$/, "ASTERISK$1");

      // This is a best efforts replacement for common symbols that you
      // might find in enums. Generally we only support enums that are
      // alphanumeric, if these replacements don't work for you, you should
      // pass a custom inflector that replaces this `enumName` method
      // with one of your own chosing.
      value =
        {
          // SQL comparison operators
          ">": "GREATER_THAN",
          ">=": "GREATER_THAN_OR_EQUAL",
          "=": "EQUAL",
          "!=": "NOT_EQUAL",
          "<>": "DIFFERENT",
          "<=": "LESS_THAN_OR_EQUAL",
          "<": "LESS_THAN",

          // PostgreSQL LIKE shortcuts
          "~~": "LIKE",
          "~~*": "ILIKE",
          "!~~": "NOT_LIKE",
          "!~~*": "NOT_ILIKE",

          // '~' doesn't necessarily represent regexps, but the three
          // operators following it likely do, so we'll use the word TILDE
          // in all for consistency.
          "~": "TILDE",
          "~*": "TILDE_ASTERISK",
          "!~": "NOT_TILDE",
          "!~*": "NOT_TILDE_ASTERISK",

          // A number of other symbols where we're not sure of their
          // meaning.  We give them common generic names so that they're
          // suitable for multiple purposes, e.g. favouring 'PLUS' over
          // 'ADDITION' and 'DOT' over 'FULL_STOP'
          "%": "PERCENT",
          "+": "PLUS",
          "-": "MINUS",
          "/": "SLASH",
          "\\": "BACKSLASH",
          _: "UNDERSCORE",
          "#": "POUND",
          "£": "STERLING",
          $: "DOLLAR",
          "&": "AMPERSAND",
          "@": "AT",
          "'": "APOSTROPHE",
          '"': "QUOTE",
          "`": "BACKTICK",
          ":": "COLON",
          ";": "SEMICOLON",
          "!": "EXCLAMATION_POINT",
          "?": "QUESTION_MARK",
          ",": "COMMA",
          ".": "DOT",
          "^": "CARET",
          "|": "BAR",
          "[": "OPEN_BRACKET",
          "]": "CLOSE_BRACKET",
          "(": "OPEN_PARENTHESIS",
          ")": "CLOSE_PARENTHESIS",
          "{": "OPEN_BRACE",
          "}": "CLOSE_BRACE",
        }[value] || value;
      return value;
    },
    enumType(name: string) {
      return upperCamelCase(name);
    },
    conditionType(typeName: string) {
      return upperCamelCase(`${typeName}-condition`);
    },
    inputType(typeName: string) {
      return upperCamelCase(`${typeName}-input`);
    },
    rangeBoundType(typeName: string) {
      return upperCamelCase(`${typeName}-range-bound`);
    },
    rangeType(typeName: string) {
      return upperCamelCase(`${typeName}-range`);
    },
    patchType(typeName: string) {
      return upperCamelCase(`${typeName}-patch`);
    },
    patchField(itemName: string) {
      return camelCase(`${itemName}-patch`);
    },
    tableName(name: string, _schema: string | null | void) {
      return camelCase(singularizeTable(name));
    },
    tableNode(name: string, _schema: string | null | void) {
      return camelCase(singularizeTable(name));
    },
    allRows(name: string, schema: string | null | void) {
      return camelCase(`all-${this.pluralize(this.tableName(name, schema))}`);
    },
    functionName(name: string, _schema: string | null | void) {
      return camelCase(name);
    },
    functionPayloadType(name: string, _schema: string | null | void) {
      return upperCamelCase(`${name}-payload`);
    },
    functionInputType(name: string, _schema: string | null | void) {
      return upperCamelCase(`${name}-input`);
    },
    tableType(name: string, schema: string | null | void) {
      return upperCamelCase(this.tableName(name, schema));
    },
    column(name: string, _table: string, _schema: string | null | void) {
      return camelCase(name);
    },
    singleRelationByKeys(
      detailedKeys: Keys,
      table: string,
      schema: string | null | void
    ) {
      return camelCase(
        `${this.tableName(table, schema)}-by-${detailedKeys
          .map(key => this.column(key.column, key.table, key.schema))
          .join("-and-")}`
      );
    },
    rowByUniqueKeys(
      detailedKeys: Keys,
      table: string,
      schema: string | null | void
    ) {
      return camelCase(
        `${this.tableName(table, schema)}-by-${detailedKeys
          .map(key => this.column(key.column, key.table, key.schema))
          .join("-and-")}`
      );
    },
    updateByKeys(
      detailedKeys: Keys,
      table: string,
      schema: string | null | void
    ) {
      return camelCase(
        `update-${this.tableName(table, schema)}-by-${detailedKeys
          .map(key => this.column(key.column, key.table, key.schema))
          .join("-and-")}`
      );
    },
    deleteByKeys(
      detailedKeys: Keys,
      table: string,
      schema: string | null | void
    ) {
      return camelCase(
        `delete-${this.tableName(table, schema)}-by-${detailedKeys
          .map(key => this.column(key.column, key.table, key.schema))
          .join("-and-")}`
      );
    },
    updateNode(name: string, _schema: string | null | void) {
      return camelCase(`update-${singularizeTable(name)}`);
    },
    deleteNode(name: string, _schema: string | null | void) {
      return camelCase(`delete-${singularizeTable(name)}`);
    },
    updateByKeysInputType(
      detailedKeys: Keys,
      name: string,
      _schema: string | null | void
    ) {
      return upperCamelCase(
        `update-${singularizeTable(name)}-by-${detailedKeys
          .map(key => this.column(key.column, key.table, key.schema))
          .join("-and-")}-input`
      );
    },
    deleteByKeysInputType(
      detailedKeys: Keys,
      name: string,
      _schema: string | null | void
    ) {
      return upperCamelCase(
        `delete-${singularizeTable(name)}-by-${detailedKeys
          .map(key => this.column(key.column, key.table, key.schema))
          .join("-and-")}-input`
      );
    },
    updateNodeInputType(name: string, _schema: string | null | void) {
      return upperCamelCase(`update-${singularizeTable(name)}-input`);
    },
    deleteNodeInputType(name: string, _schema: string | null | void) {
      return upperCamelCase(`delete-${singularizeTable(name)}-input`);
    },
    manyRelationByKeys(
      detailedKeys: Keys,
      table: string,
      schema: string | null | void,
      _foreignTable: string,
      _foreignSchema: string | null | void
    ) {
      return camelCase(
        `${this.pluralize(this.tableName(table, schema))}-by-${detailedKeys
          .map(key => this.column(key.column, key.table, key.schema))
          .join("-and-")}`
      );
    },
    edge(typeName: string) {
      return upperCamelCase(`${pluralize(typeName)}-edge`);
    },
    edgeField(name: string, _schema: string | null | void) {
      return camelCase(`${singularizeTable(name)}-edge`);
    },
    connection(typeName: string) {
      return upperCamelCase(`${this.pluralize(typeName)}-connection`);
    },
    scalarFunctionConnection(
      procName: string,
      _procSchema: string | null | void
    ) {
      return upperCamelCase(`${procName}-connection`);
    },
    scalarFunctionEdge(procName: string, _procSchema: string | null | void) {
      return upperCamelCase(`${procName}-edge`);
    },
    createField(name: string, _schema: string | null | void) {
      return camelCase(`create-${singularizeTable(name)}`);
    },
    createInputType(name: string, _schema: string | null | void) {
      return upperCamelCase(`create-${singularizeTable(name)}-input`);
    },
    createPayloadType(name: string, _schema: string | null | void) {
      return upperCamelCase(`create-${singularizeTable(name)}-payload`);
    },
    updatePayloadType(name: string, _schema: string | null | void) {
      return upperCamelCase(`update-${singularizeTable(name)}-payload`);
    },
    deletePayloadType(name: string, _schema: string | null | void) {
      return upperCamelCase(`delete-${singularizeTable(name)}-payload`);
    },
    ...overrides,
  });
};

export const defaultInflection = newInflector();
