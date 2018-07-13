// @flow
import type { Plugin } from "graphile-build";
import { types as pgTypes } from "pg";

import makeGraphQLJSONTypes from "../GraphQLJSON";

import rawParseInterval from "postgres-interval";
import LRU from "lru-cache";

function indent(str) {
  return "  " + str.replace(/\n/g, "\n  ");
}

const parseCache = LRU(500);
function parseInterval(str) {
  let result = parseCache.get(str);
  if (!result) {
    result = rawParseInterval(str);
    Object.freeze(result);
    parseCache.set(str, result);
  }
  return result;
}

const pgRangeParser = {
  parse(str) {
    const parts = str.split(",");
    if (parts.length !== 2) {
      throw new Error("Invalid daterange");
    }

    return {
      start:
        parts[0].length > 1
          ? {
              inclusive: parts[0][0] === "[",
              value: parts[0].slice(1),
            }
          : null,
      end:
        parts[1].length > 1
          ? {
              inclusive: parts[1][parts[1].length - 1] === "]",
              value: parts[1].slice(0, -1),
            }
          : null,
    };
  },

  serialize({ start, end }) {
    const inclusivity = {
      true: "[]",
      false: "()",
    };

    return [
      start ? inclusivity[start.inclusive][0] + start.value : "[",
      end ? end.value + inclusivity[end.inclusive][1] : "]",
    ].join(",");
  },
};

export default (function PgTypesPlugin(
  builder,
  { pgExtendedTypes = true, pgLegacyJsonUuid = false }
) {
  // XXX: most of this should be in an "init" hook, not a "build" hook
  builder.hook("build", build => {
    const {
      pgIntrospectionResultsByKind: introspectionResultsByKind,
      getTypeByName,
      addType,
      pgSql: sql,
      inflection,
      graphql,
    } = build;
    const {
      GraphQLNonNull,
      GraphQLString,
      GraphQLInt,
      GraphQLFloat,
      GraphQLBoolean,
      GraphQLList,
      GraphQLEnumType,
      GraphQLObjectType,
      GraphQLInputObjectType,
      GraphQLScalarType,
      isInputType,
      getNamedType,
      Kind,
    } = graphql;

    const gqlTypeByTypeIdGenerator = {};
    const gqlInputTypeByTypeIdGenerator = {};
    if (build.pgGqlTypeByTypeId || build.pgGqlInputTypeByTypeId) {
      // I don't expect anyone to receive this error, because I don't think anyone uses this interface.
      throw new Error(
        "Sorry! This interface is no longer supported because it is not granular enough. It's not hard to port it to the new system - please contact Benjie and he'll walk you through it."
      );
    }

    //TODO pretty sure these aren't doing anything
    const gqlTypeByTypeIdAndModifier = Object.assign(
      {},
      build.pgGqlTypeByTypeIdAndModifier
    );
    const gqlInputTypeByTypeIdAndModifier = Object.assign(
      {},
      build.pgGqlInputTypeByTypeIdAndModifier
    );

    //looks like the mapper uses typeIds?
    const pg2GqlMapper = {};

    /**
     * Transforms sql to gql?
     */
    const pg2gql = (val, type) => {
      if (val == null) {
        return val;
      }

      //todo add some explanation of what this is checking for
      if (val.__isNull) {
        return null;
      }

      if (pg2GqlMapper[type.id]) {
        return pg2GqlMapper[type.id].map(val);

        //do structural recursion on arrays and domainBaseType?
      } else if (type.domainBaseType) {
        return pg2gql(val, type.domainBaseType);
      } else if (type.isPgArray) {
        if (!Array.isArray(val)) {
          throw new Error(
            `Expected array when converting PostgreSQL data into GraphQL; failing type: '${
              type.namespaceName
            }.${type.name}'`
          );
        }
        return val.map(v => pg2gql(v, type.arrayItemType));

        //basically, so if it's not in the mapper just return val?
      } else {
        return val;
      }
    };

    const gql2pg = (val, type, modifier) => {
      //print stack trace if modifier is undefined;
      if (modifier === undefined) {
        let stack;
        try {
          throw new Error();
        } catch (e) {
          stack = e.stack;
        }
        // eslint-disable-next-line no-console
        console.warn(
          "gql2pg should be called with three arguments, the third being the type modifier (or `null`); " +
            (stack || "")
        );
        // Hack for backwards compatibility: TODO why?
        modifier = null;
      }

      //TODO look up what sql.null is
      if (val == null) {
        return sql.null;
      }

      //TODO find out why we use the pg2Gql mapper in the gql2pg function
      if (pg2GqlMapper[type.id]) {
        return pg2GqlMapper[type.id].unmap(val, modifier); //Ok, so unmapping, like inverse operation

        //another structural recursion, we can probably hoist this
      } else if (type.domainBaseType) {
        return gql2pg(val, type.domainBaseType, type.domainTypeModifier);
      } else if (type.isPgArray) {
        if (!Array.isArray(val)) {
          throw new Error(
            `Expected array when converting GraphQL data into PostgreSQL data; failing type: '${
              type.namespaceName
            }.${type.name}' (type: ${type === null ? "null" : typeof type})`
          );
        }

        //ok interesting
        return sql.fragment`array[${sql.join(
          val.map(v => gql2pg(v, type.arrayItemType, modifier)),
          ", "
        )}]::${sql.identifier(type.namespaceName)}.${sql.identifier(
          type.name
        )}`;
      } else {
        return sql.value(val);
      }
    };

    //not sure why this has to be a thunk? maybe candidate for factory function
    const makeIntervalFields = () => {
      return {
        seconds: {
          description:
            "A quantity of seconds. This is the only non-integer field, as all the other fields will dump their overflow into a smaller unit of time. Intervals don’t have a smaller unit than seconds.",
          type: GraphQLFloat,
        },
        minutes: {
          description: "A quantity of minutes.",
          type: GraphQLInt,
        },
        hours: {
          description: "A quantity of hours.",
          type: GraphQLInt,
        },
        days: {
          description: "A quantity of days.",
          type: GraphQLInt,
        },
        months: {
          description: "A quantity of months.",
          type: GraphQLInt,
        },
        years: {
          description: "A quantity of years.",
          type: GraphQLInt,
        },
      };
    };
    const GQLInterval = new GraphQLObjectType({
      name: "Interval",
      description:
        "An interval of time that has passed where the smallest distinct unit is a second.",
      fields: makeIntervalFields(),
    });

    //TODO what does addType do?
    addType(GQLInterval);

    const GQLIntervalInput = new GraphQLInputObjectType({
      name: "IntervalInput",
      description:
        "An interval of time that has passed where the smallest distinct unit is a second.",
      fields: makeIntervalFields(),
    });
    addType(GQLIntervalInput);

    //looks like a factory function candidate
    const stringType = (name, description) =>
      new GraphQLScalarType({
        name,
        description,
        serialize: value => String(value),
        parseValue: value => String(value),
        parseLiteral: ast => {
          if (ast.kind !== Kind.STRING) {
            throw new Error("Can only parse string values");
          }
          return ast.value;
        },
      });

    const BigFloat = stringType(
      "BigFloat",
      "A floating point number that requires more precision than IEEE 754 binary 64"
    );
    const BitString = stringType(
      "BitString",
      "A string representing a series of binary bits"
    );
    addType(BigFloat);
    addType(BitString);

    /****************************************************************************************
     * Tweaking section
     *
     *
     * TODO this all seems like a lot of stuff just to do really run tweakToText on a couple
     * of specific types
     *****************************************************************************************/

    //well these aren't gql types, so  what are they?
    const rawTypes = [
      1186, // interval
      1082, // date
      1114, // timestamp
      1184, // timestamptz
      1083, // time
      1266, // timetz
    ];

    const tweakToJson = fragment => fragment; // Since everything is to_json'd now, just pass through
    const tweakToText = fragment => sql.fragment`(${fragment})::text`;

    //TODO this does not appear to be used anywhere; not in here or in any other plugins
    const pgTweaksByTypeIdAndModifer = {};
    const pgTweaksByTypeId = Object.assign(
      // ::text rawTypes
      rawTypes.reduce((memo, typeId) => {
        memo[typeId] = tweakToText;
        return memo;
      }, {}),
      {
        // cast numbers above our ken to strings to avoid loss of precision
        "20": tweakToText,
        "1700": tweakToText,
        // to_json all dates to make them ISO (overrides rawTypes above)
        "1082": tweakToJson,
        "1114": tweakToJson,
        "1184": tweakToJson,
        "1083": tweakToJson,
        "1266": tweakToJson,
      }
    );

    const categoryLookup = {
      B: () => GraphQLBoolean,

      // Numbers may be too large for GraphQL/JS to handle, so stringify by
      // default.
      N: type => {
        pgTweaksByTypeId[type.id] = tweakToText;
        return BigFloat;
      },

      A: (type, typeModifier) =>
        new GraphQLList(
          getGqlTypeByTypeIdAndModifier(type.arrayItemTypeId, typeModifier)
        ),
    };

    const pgTweakFragmentForTypeAndModifier = (
      fragment,
      type,
      typeModifier = null,
      resolveData
    ) => {
      const typeModifierKey = typeModifier != null ? typeModifier : -1;
      const tweaker =
        (pgTweaksByTypeIdAndModifer[type.id] &&
          pgTweaksByTypeIdAndModifer[type.id][typeModifierKey]) ||
        pgTweaksByTypeId[type.id];
      if (tweaker) {
        return tweaker(fragment, resolveData);
      } else if (type.domainBaseType) {
        // TODO: check that domains don't support atttypemod
        return pgTweakFragmentForTypeAndModifier(
          fragment,
          type.domainBaseType,
          type.domainBaseTypeModifier,
          resolveData
        );
      } else if (type.isPgArray) {
        const error = new Error(
          "Internal graphile-build-pg error: should not attempt to tweak an array, please process array before tweaking (type: `${type.namespaceName}.${type.name}`)"
        );

        //TODO why only throw this in test? if correct, should move to the if conditional
        if (process.env.NODE_ENV === "test") {
          // This is to ensure that Graphile core does not introduce these problems
          throw error;
        }
        // eslint-disable-next-line no-console
        console.error(error);
        return fragment;
      } else {
        return fragment;
      }
    };

    //TODO more string stuff, should probably move up above
    /*
        Determined by running:

          select oid, typname, typarray, typcategory, typtype from pg_catalog.pg_type where typtype = 'b' order by oid;

        We only need to add oidLookups for types that don't have the correct fallback
      */
    const SimpleDate = stringType("Date", "The day, does not include a time.");
    const SimpleDatetime = stringType(
      "Datetime",
      "A point in time as described by the [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) standard. May or may not include a timezone."
    );
    const SimpleTime = stringType(
      "Time",
      "The exact time of day, does not include the date. May or may not have a timezone offset."
    );
    const SimpleJSON = stringType(
      pgLegacyJsonUuid ? "Json" : "JSON",
      "A JavaScript object encoded in the JSON format as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf)."
    );
    const SimpleUUID = stringType(
      pgLegacyJsonUuid ? "Uuid" : "UUID",
      "A universally unique identifier as defined by [RFC 4122](https://tools.ietf.org/html/rfc4122)."
    );

    const { GraphQLJSON, GraphQLJson } = makeGraphQLJSONTypes(graphql);

    // pgExtendedTypes might change what types we use for things
    const JSONType = pgExtendedTypes
      ? pgLegacyJsonUuid ? GraphQLJson : GraphQLJSON
      : SimpleJSON;

    //TODO not sure why we just reassign everything we just created up above
    const UUIDType = SimpleUUID; // GraphQLUUID
    const DateType = SimpleDate; // GraphQLDate
    const DateTimeType = SimpleDatetime; // GraphQLDateTime
    const TimeType = SimpleTime; // GraphQLTime

    // 'point' in PostgreSQL is a 16-byte type that's comprised of two 8-byte floats.
    //TODO we didn't add these types?
    const Point = new GraphQLObjectType({
      name: "Point",
      fields: {
        x: {
          type: new GraphQLNonNull(GraphQLFloat),
        },
        y: {
          type: new GraphQLNonNull(GraphQLFloat),
        },
      },
    });
    const PointInput = new GraphQLInputObjectType({
      name: "PointInput",
      fields: {
        x: {
          type: new GraphQLNonNull(GraphQLFloat),
        },
        y: {
          type: new GraphQLNonNull(GraphQLFloat),
        },
      },
    });

    // Other plugins might want to use JSON
    addType(JSONType);
    addType(UUIDType);
    addType(DateType);
    addType(DateTimeType);
    addType(TimeType);

    //TODO what is this for?
    const oidLookup = {
      "20": stringType(
        "BigInt",
        "A signed eight-byte integer. The upper big integer values are greater then the max value for a JavaScript number. Therefore all big integers will be output as strings and not numbers."
      ), // bitint - even though this is int8, it's too big for JS int, so cast to string.
      "21": GraphQLInt, // int2
      "23": GraphQLInt, // int4
      "700": GraphQLFloat, // float4
      "701": GraphQLFloat, // float8
      "1700": BigFloat, // numeric
      "790": GraphQLFloat, // money

      "1186": GQLInterval, // interval
      "1082": DateType, // date
      "1114": DateTimeType, // timestamp
      "1184": DateTimeType, // timestamptz
      "1083": TimeType, // time
      "1266": TimeType, // timetz

      "114": JSONType, // json
      "3802": JSONType, // jsonb
      "2950": UUIDType, // uuid

      "1560": BitString, // bit
      "1562": BitString, // varbit

      "18": GraphQLString, // char
      "25": GraphQLString, // text
      "1043": GraphQLString, // varchar

      "600": Point, // point
    };
    const oidInputLookup = {
      "1186": GQLIntervalInput, // interval
      "600": PointInput, // point
    };

    /****************************************************************************************
     * Extending the mapper? Not sure why we do this here all of a sudden?
     *****************************************************************************************/

    const identity = _ => _;
    const jsonStringify = o => JSON.stringify(o);

    //not sure what this is but we should label it; looks like json stuff
    if (pgExtendedTypes) {
      pg2GqlMapper[114] = {
        map: identity,
        unmap: o => sql.value(jsonStringify(o)),
      };
    } else {
      pg2GqlMapper[114] = {
        map: jsonStringify,
        unmap: str => sql.value(str),
      };
    }
    pg2GqlMapper[3802] = pg2GqlMapper[114]; // jsonb

    // interval
    pg2GqlMapper[1186] = {
      map: str => parseInterval(str),
      unmap: o => {
        const keys = ["seconds", "minutes", "hours", "days", "months", "years"];
        const parts = [];
        for (const key of keys) {
          if (o[key]) {
            parts.push(`${o[key]} ${key}`);
          }
        }
        return sql.value(parts.join(" ") || "0 seconds");
      },
    };

    const parseMoney = str => {
      const numerical = str.replace(/[^0-9.,-]/g, "");
      const lastCommaIndex = numerical.lastIndexOf(",");
      if (lastCommaIndex >= 0 && lastCommaIndex === numerical.length - 3) {
        // Assume string is of the form '123.456,78'
        return parseFloat(numerical.replace(/\./g, "").replace(",", "."));
      } else {
        // Assume string is of the form '123,456.78'
        return parseFloat(numerical.replace(/,/g, ""));
      }
    };
    pg2GqlMapper[790] = {
      map: parseMoney,
      unmap: val => sql.fragment`(${sql.value(val)})::money`,
    };

    // point
    pg2GqlMapper[600] = {
      map: f => {
        if (f[0] === "(" && f[f.length - 1] === ")") {
          const [x, y] = f
            .substr(1, f.length - 2)
            .split(",")
            .map(f => parseFloat(f));
          return { x, y };
        }
      },
      unmap: o => sql.fragment`point(${sql.value(o.x)}, ${sql.value(o.y)})`,
    };

    /****************************************************************************************
     * Extending the mapper? Not sure why we do this here all of a sudden?
     *****************************************************************************************/

    // TODO: add more support for geometric types
    /*
     * Enforce: this is the fallback when we can't find a specific GraphQL type
     * for a specific PG type.  Use the generators from
     * `pgRegisterGqlTypeByTypeId` first, this is a last resort.
     */

    /************************************************************************************
     *
     * GQL Type Registers and Generators
     *
     ************************************************************************************/

    function getGqlTypeByTypeIdAndModifier2(
      typeId,
      typeModifier = null,
      useFallback = true
    ) {
      //make sure this type was actually found in the database
      if (!introspectionResultsByKind.typeById[typeId]) {
        throw new Error(
          `Type '${typeId}' not present in introspection results`
        );
      }

      //convert null to -1 for the lookup queries
      const typeModifierKey = typeModifier != null ? typeModifier : -1;

      //make sure that we are always querying instantiated objects
      if (!gqlTypeByTypeIdAndModifier[typeId]) {
        gqlTypeByTypeIdAndModifier[typeId] = {};
      }
      if (!gqlInputTypeByTypeIdAndModifier[typeId]) {
        gqlInputTypeByTypeIdAndModifier[typeId] = {};
      }

      //if the type was cached, simply return it
      const gqlType = gqlTypeByTypeIdAndModifier[typeId][typeModifierKey];
      if (gqlType) return gqlType;

      //try to find a plugin-defined generator
      //TODO there appears to be a lot of redundancy in here, but I need to look
      //a bit closer at what the gnerator spec is
      const gen = gqlTypeByTypeIdGenerator[typeId];
      if (gen) {
        const set = Type => {
          registerType(typeId, typeModifierKey, Type);
        };
        const result = gen(set, typeModifier);
        if (result) {
          if (
            gqlTypeByTypeIdAndModifier[typeId][typeModifierKey] &&
            gqlTypeByTypeIdAndModifier[typeId][typeModifierKey] !== result
          ) {
            throw new Error(
              `Callback and return types differ when defining type for '${typeId}'`
            );
          }
          registerType(typeId, typeModifierKey, result);
          return result;
        }
      }

      // Fall back to `null` modifier
      if (typeModifierKey > -1) {
        const nullModifierResult = getGqlTypeByTypeIdAndModifier(
          typeId,
          null,
          false
        );
        if (nullModifierResult) {
          return nullModifierResult;
        }
      }

      // If the null modifier doesn't work, fall back to the default type generator
      if (useFallback) {
        return getDefaultGQLTypeByTypeIdAndModifier(
          typeId,
          typeModifier,
          typeModifierKey
        );
      }
    }

    function getGqlTypeByTypeIdAndModifier(
      typeId,
      typeModifier = null,
      useFallback = true
    ) {
      //make sure this type was actually found in the database
      if (!introspectionResultsByKind.typeById[typeId]) {
        throw new Error(
          `Type '${typeId}' not present in introspection results`
        );
      }

      //convert null to -1 for the lookup queries
      const typeModifierKey = typeModifier != null ? typeModifier : -1;

      //make sure that we are always querying instantiated objects
      if (!gqlTypeByTypeIdAndModifier[typeId]) {
        gqlTypeByTypeIdAndModifier[typeId] = {};
      }
      if (!gqlInputTypeByTypeIdAndModifier[typeId]) {
        gqlInputTypeByTypeIdAndModifier[typeId] = {};
      }

      //if the type was cached, simply return it
      const gqlType = gqlTypeByTypeIdAndModifier[typeId][typeModifierKey];
      if (gqlType) return gqlType;

      //try to find a plugin-defined generator
      //TODO there appears to be a lot of redundancy in here, but I need to look
      //a bit closer at what the gnerator spec is
      const gen = gqlTypeByTypeIdGenerator[typeId];
      if (gen) {
        const set = Type => {
          registerType(typeId, typeModifierKey, Type);
        };
        const result = gen(set, typeModifier);
        if (result) {
          if (
            gqlTypeByTypeIdAndModifier[typeId][typeModifierKey] &&
            gqlTypeByTypeIdAndModifier[typeId][typeModifierKey] !== result
          ) {
            throw new Error(
              `Callback and return types differ when defining type for '${typeId}'`
            );
          }
          registerType(typeId, typeModifierKey, result);
          return result;
        }


      }

      // Fall back to `null` modifier
      if (typeModifierKey > -1) {
        const nullModifierResult = getGqlTypeByTypeIdAndModifier(
          typeId,
          null,
          false
        );
        if (nullModifierResult) {
          return nullModifierResult;
        }
      }

      if (useFallback && !gqlTypeByTypeIdAndModifier[typeId][typeModifierKey]) {
        return getDefaultGQLTypeByTypeIdAndModifier(
          typeId,
          typeModifier,
          typeModifierKey
        );
      }

      console.log(typeModifierKey, useFallback, gqlType, "no fucking result");
      //return gqlTypeByTypeIdAndModifier[typeId][typeModifierKey];
    }

    /* The default GQL type generator to use if none of the subsequent plugins provide the required generators
     *
     * There are four generation options:
     *
     * 1) We have an explicit type matched based on the typeId. Those are found in the oidLookup table
     * 2) If it is a wrapper type, parameterize it based on it's contents
     *     -- Note: this only unwraps a finite amount of times (50) before throwing an error
     * 3) We can also look up the types by generic category
     * 4) If we cannot find a type in any of those, then we default to a string.
     *
     * The generator will cache the results on gqlTypeByTypeIdAndModifier[pgTypeId][typeModifier] (and
     * gqlInputTypeByTypeIdAndModifier[pgTypeId][typeModifier], where applicable)
     *
     * Since this is meant to only be accessed from the module's exposed typeGetter, we make the following assumptions:
     *
     * 1) pgTypeId refers to a valid PG type and can be found on pgInstrospectionResultsByKind.typeById
     * 2) No type currently exists on gqlTypeByTypeIdAndModifier[pgTypeId][modifierKey]
     * 3) Both gqlTypeByTypeIdAndModifier[pgTypeId] and gqlInputTypeByTypeIdAndModifier[pgTypeId] are instantiated objects
     *
     * We do not check for these things, so the onus is on the caller.
     *
     * We provide a public function `getDefaultGQLTypeByPGTypeIdAndModifier` that wraps the logic in
     * `_getDefaultGQLTypeByPGTypeIdAndModifier` to provide a stack trace should something go wrong.
     *
     */
    let recusiveDepth = 0;
    const getDefaultGQLTypeByTypeIdAndModifier = (
      pgTypeId,
      modifier,
      modifierKey
    ) => {
      if (recusiveDepth > 50)
        throw new Error("Exceeded maximum recursion for resolving type!");

      try {
        recusiveDepth++;
        return _getDefaultGQLTypeByTypeIdAndModifier(
          pgTypeId,
          modifier,
          modifierKey
        );
      } catch (e) {
        const type = introspectionResultsByKind.typeById[pgTypeId];
        const error = new Error(
          `Error occurred when processing database type '${
            type.namespaceName
          }.${type.name}' (type=${type.type}):\n${indent(e.message)}`
        );
        // $FlowFixMe
        error.originalError = e;
        throw error;
      } finally {
        recusiveDepth--;
      }
    };

    const _getDefaultGQLTypeByTypeIdAndModifier = (
      pgTypeId,
      modifier,
      modifierKey
    ) => {
      /*** Type Creation Paths Below ***/

      //explicit types
      let gqlType = oidLookup[pgTypeId];
      if (gqlType) {
        //also try to override the input type
        const gqlInputType = oidInputLookup[pgTypeId];
        registerType(pgTypeId, modifierKey, gqlType, gqlInputType);
        return gqlType;
      }

      const pgType = introspectionResultsByKind.typeById[pgTypeId];

      //wrapper types
      switch (pgType.type) {
        case "e":
          return generateAndRegisterGQLEnumType(pgType, modifierKey);
        case "r":
          return generateAndRegisterGQLRangeTypes(
            pgType,
            modifier,
            modifierKey
          );
        case "d":
          return linkGQLDomainType(pgType, modifier, modifierKey);
      }

      // Category Types
      const gen = categoryLookup[pgType.category];
      if (gen) {
        gqlType = gen(pgType, modifier);
        registerType(pgTypeId, modifierKey, gqlType);
        return gqlType;
      }

      // Nothing else worked; pass through as string!
      // XXX: consider using stringType(upperFirst(camelCase(`fallback_${type.name}`)), type.description)?
      registerType(pgTypeId, modifierKey, GraphQLString);
      return GraphQLString;
    };

    /******************************************************************
     * Registration Utility
     ******************************************************************/

    function registerType(typeId, modifierKey, gqlType, gqlInputType) {
      //TODO check if we are really only supposed to call 'addType' on the gqlType
      gqlTypeByTypeIdAndModifier[typeId][modifierKey] = gqlType;
      addType(getNamedType(gqlType));

      //if explicit, set the input type
      if (gqlInputType) {
        gqlInputTypeByTypeIdAndModifier[typeId][modifierKey] = gqlInputType;

        //fall back on the output type, if possible
      } else if (isInputType(gqlType)) {
        gqlInputTypeByTypeIdAndModifier[typeId][modifierKey] = gqlType;
      }
    }

    /******************************************************************
     * Range Types
     ******************************************************************/

    function generateAndRegisterGQLRangeTypes(
      pgRangeType,
      modifier,
      modifierKey
    ) {
      let Range, RangeInput;
      const [pgElementType, ElementType] = getElementTypes(
        pgRangeType,
        modifier
      );

      //if the range type already exists by name, then we just need to register it by modifier
      Range = getTypeByName(inflection.rangeType(ElementType.name));
      if (Range) {
        //TODO if we got it via getTypeByName, then it seems a little weird that we are registering?
        RangeInput = getTypeByName(inflection.inputType(Range.name));
        registerType(pgRangeType.id, modifierKey, Range, RangeInput);
        return Range;
      }

      //otherwise, generate them
      [Range, RangeInput] = generateRangeTypes(ElementType);

      //then register them
      //todo why is this the only one with a mapper
      registerType(pgRangeType.id, modifierKey, Range, RangeInput);
      pg2GqlMapper[pgRangeType.id] = generateRangeMapper(
        pgRangeType,
        pgElementType
      );

      return Range;
    }

    function getElementTypes(pgType, modifier) {
      const pgElementType =
        introspectionResultsByKind.typeById[pgType.rangeSubTypeId];
      const ElementType = getGqlTypeByTypeIdAndModifier(
        pgElementType.id,
        modifier
      );
      if (!ElementType) {
        throw new Error(`Range of unsupported: ${pgElementType}`);
      }
      return [pgElementType, ElementType];
    }

    function generateRangeTypes(ElementType) {
      //generate the types
      const RangeBoundType = generateRangeBoundType(ElementType);
      const RangeBoundInputType = generateRangeBoundInputType(
        ElementType,
        RangeBoundType
      );
      const RangeType = generateRangeType(ElementType, RangeBoundType);
      const RangeInputType = generateRangeInputType(
        ElementType,
        RangeType,
        RangeBoundInputType
      );

      //return the pair
      return [RangeType, RangeInputType];
    }

    function generateRangeBoundType(ElementType) {
      return new GraphQLObjectType({
        name: inflection.rangeBoundType(ElementType.name),
        description:
          "The value at one end of a range. A range can either include this value, or not.",
        fields: {
          value: {
            description: "The value at one end of our range.",
            type: new GraphQLNonNull(ElementType),
          },
          inclusive: {
            description:
              "Whether or not the value of this bound is included in the range.",
            type: new GraphQLNonNull(GraphQLBoolean),
          },
        },
      });
    }

    function generateRangeBoundInputType(ElementType, RangeBoundType) {
      return new GraphQLInputObjectType({
        name: inflection.inputType(RangeBoundType.name),
        description:
          "The value at one end of a range. A range can either include this value, or not.",
        fields: {
          value: {
            description: "The value at one end of our range.",
            type: new GraphQLNonNull(ElementType),
          },
          inclusive: {
            description:
              "Whether or not the value of this bound is included in the range.",
            type: new GraphQLNonNull(GraphQLBoolean),
          },
        },
      });
    }

    function generateRangeType(ElementType, RangeBoundType) {
      return new GraphQLObjectType({
        name: inflection.rangeType(ElementType.name),
        description: `A range of \`${ElementType.name}\`.`,
        fields: {
          start: {
            description: "The starting bound of our range.",
            type: RangeBoundType,
          },
          end: {
            description: "The ending bound of our range.",
            type: RangeBoundType,
          },
        },
      });
    }

    function generateRangeInputType(
      ElementType,
      RangeType,
      RangeBoundInputType
    ) {
      return new GraphQLInputObjectType({
        name: inflection.inputType(RangeType.name),
        description: `A range of \`${ElementType.name}\`.`,
        fields: {
          start: {
            description: "The starting bound of our range.",
            type: RangeBoundInputType,
          },
          end: {
            description: "The ending bound of our range.",
            type: RangeBoundInputType,
          },
        },
      });
    }

    //TODO take a look at this mapper
    function generateRangeMapper(pgRangeType, pgElementType) {
      return {
        map: pgRange => {
          const parsed = pgRangeParser.parse(pgRange);
          // Since the value we will get from `parsed.(start|end).value` is a
          // string but our code will expect it to be the value after `pg`
          // parsed it, we pass through to `pg-types` for parsing.
          const pgParse =
            rawTypes.indexOf(parseInt(pgElementType.id, 10)) >= 0
              ? identity
              : pgTypes.getTypeParser(pgElementType.id);
          const { start, end } = parsed;
          return {
            start: start
              ? {
                  value: pg2gql(pgParse(start.value), pgElementType),
                  inclusive: start.inclusive,
                }
              : null,
            end: end
              ? {
                  value: pg2gql(pgParse(end.value), pgElementType),
                  inclusive: end.inclusive,
                }
              : null,
          };
        },
        unmap: ({ start, end }) => {
          // Ref: https://www.postgresql.org/docs/9.6/static/rangetypes.html#RANGETYPES-CONSTRUCT
          const lower =
            (start && gql2pg(start.value, pgElementType, null)) || sql.null;
          const upper =
            (end && gql2pg(end.value, pgElementType, null)) || sql.null;
          const lowerInclusive = start && !start.inclusive ? "(" : "[";
          const upperInclusive = end && !end.inclusive ? ")" : "]";
          return sql.fragment`${sql.identifier(
            pgRangeType.namespaceName,
            pgRangeType.name
          )}(${lower}, ${upper}, ${sql.literal(
            lowerInclusive + upperInclusive
          )})`;
        },
      };
    }

    /******************************************************************
     * Domain Types
     ******************************************************************/

    //TODO not entirely sure what a domain is or what this is doing; I think this needs enhanced
    //error checking
    //looks like it is taking what was registerd uner domainBaseType and then registering it on DomainType
    function linkGQLDomainType(pgDomainType, modifier, modifierKey) {
      if (!pgDomainType.domainBaseTypeId) return;

      const BaseType = getGqlTypeByTypeIdAndModifier(
        pgDomainType.domainBaseTypeId,
        modifier
      );
      const BaseInputType =
        gqlInputTypeByTypeIdAndModifier[pgDomainType.domainBaseTypeId][
          modifierKey
        ];

      //create the regular type
      // Hack stolen from: https://github.com/graphile/postgraphile/blob/ade728ed8f8e3ecdc5fdad7d770c67aa573578eb/src/graphql/schema/type/aliasGqlType.ts#L16
      const DomainType = Object.assign(Object.create(BaseType), {
        name: inflection.domainType(pgDomainType),
        description: pgDomainType.description,
      });

      //create the input type
      let DomainInputType;
      if (BaseInputType && BaseInputType !== BaseType) {
        DomainInputType = Object.assign(Object.create(BaseInputType), {
          name: inflection.inputType(DomainType),
          description: pgDomainType.description,
        });
      }

      registerType(pgDomainType.id, modifierKey, DomainType, DomainInputType);

      return DomainType;
    }

    /******************************************************************
     * Enum Types
     ******************************************************************/

    function generateAndRegisterGQLEnumType(pgEnumType, modifierKey) {
      const EnumType = generateEnumType(pgEnumType);
      registerType(pgEnumType.id, modifierKey, EnumType);
      return EnumType;
    }

    function generateEnumType(pgEnumType) {
      return new GraphQLEnumType({
        name: inflection.enumType(pgEnumType),
        description: pgEnumType.description,
        values: pgEnumType.enumVariants.reduce((memo, value) => {
          memo[inflection.enumName(value)] = {
            value: value,
          };
          return memo;
        }, {}),
      });
    }

    function getGqlInputTypeByTypeIdAndModifier(typeId, typeModifier = null) {
      // First, load the OUTPUT type (it might register an input type)
      getGqlTypeByTypeIdAndModifier(typeId, typeModifier);

      const typeModifierKey = typeModifier != null ? typeModifier : -1;
      if (!gqlInputTypeByTypeIdAndModifier[typeId]) {
        gqlInputTypeByTypeIdAndModifier[typeId] = {};
      }
      if (!gqlInputTypeByTypeIdAndModifier[typeId][typeModifierKey]) {
        const type = introspectionResultsByKind.type.find(t => t.id === typeId);

        if (!type) {
          throw new Error(
            `Type '${typeId}' not present in introspection results`
          );
        }
        const gen = gqlInputTypeByTypeIdGenerator[type.id];
        if (gen) {
          const set = Type => {
            gqlInputTypeByTypeIdAndModifier[type.id][typeModifierKey] = Type;
          };
          const result = gen(set, typeModifier);
          if (result) {
            if (
              gqlInputTypeByTypeIdAndModifier[type.id][typeModifierKey] &&
              gqlInputTypeByTypeIdAndModifier[type.id][typeModifierKey] !==
                result
            ) {
              throw new Error(
                `Callback and return types differ when defining type for '${
                  type.id
                }'`
              );
            }
            gqlInputTypeByTypeIdAndModifier[type.id][typeModifierKey] = result;
          }
        }
      }
      if (
        !gqlInputTypeByTypeIdAndModifier[typeId][typeModifierKey] &&
        typeModifierKey > -1
      ) {
        // Fall back to default
        return getGqlInputTypeByTypeIdAndModifier(typeId, null);
      }
      return gqlInputTypeByTypeIdAndModifier[typeId][typeModifierKey];
    }
    function registerGqlTypeByTypeId(typeId, gen, yieldToExisting = false) {
      if (gqlTypeByTypeIdGenerator[typeId]) {
        if (yieldToExisting) {
          return;
        }
        throw new Error(
          `There's already a type generator registered for '${typeId}'`
        );
      }
      gqlTypeByTypeIdGenerator[typeId] = gen;
    }
    function registerGqlInputTypeByTypeId(
      typeId,
      gen,
      yieldToExisting = false
    ) {
      if (gqlInputTypeByTypeIdGenerator[typeId]) {
        if (yieldToExisting) {
          return;
        }
        throw new Error(
          `There's already an input type generator registered for '${typeId}'`
        );
      }
      gqlInputTypeByTypeIdGenerator[typeId] = gen;
    }

    // DEPRECATIONS!
    function getGqlTypeByTypeId(typeId, typeModifier) {
      if (typeModifier === undefined) {
        // eslint-disable-next-line no-console
        console.warn(
          "DEPRECATION WARNING: getGqlTypeByTypeId should not be used - for some columns we also require typeModifier to be specified. Please update your code ASAP to pass `attribute.typeModifier` through as the second parameter (or null if it's not available)."
        );
      }
      return getGqlTypeByTypeIdAndModifier(typeId, typeModifier);
    }
    function getGqlInputTypeByTypeId(typeId, typeModifier) {
      if (typeModifier === undefined) {
        // eslint-disable-next-line no-console
        console.warn(
          "DEPRECATION WARNING: getGqlInputTypeByTypeId should not be used - for some columns we also require typeModifier to be specified. Please update your code ASAP to pass `attribute.typeModifier` through as the second parameter (or null if it's not available)."
        );
      }
      return getGqlInputTypeByTypeIdAndModifier(typeId, typeModifier);
    }
    function pgTweakFragmentForType(fragment, type, typeModifier, resolveData) {
      if (typeModifier === undefined) {
        // eslint-disable-next-line no-console
        console.warn(
          "DEPRECATION WARNING: pgTweakFragmentForType should not be used - for some columns we also require typeModifier to be specified. Please update your code ASAP to pass `attribute.typeModifier` through as the third parameter (or null if it's not available)."
        );
      }
      return pgTweakFragmentForTypeAndModifier(
        fragment,
        type,
        typeModifier,
        resolveData
      );
    }
    // END OF DEPRECATIONS!

    return build.extend(build, {
      pgRegisterGqlTypeByTypeId: registerGqlTypeByTypeId,
      pgRegisterGqlInputTypeByTypeId: registerGqlInputTypeByTypeId,
      pgGetGqlTypeByTypeIdAndModifier: getGqlTypeByTypeIdAndModifier,
      pgGetGqlInputTypeByTypeIdAndModifier: getGqlInputTypeByTypeIdAndModifier,
      pg2GqlMapper,
      pg2gql,
      gql2pg,
      pgTweakFragmentForTypeAndModifier,
      pgTweaksByTypeId,
      pgTweaksByTypeIdAndModifer,

      // DEPRECATED METHODS:
      pgGetGqlTypeByTypeId: getGqlTypeByTypeId, // DEPRECATED, replaced by getGqlTypeByTypeIdAndModifier
      pgGetGqlInputTypeByTypeId: getGqlInputTypeByTypeId, // DEPRECATED, replaced by getGqlInputTypeByTypeIdAndModifier
      pgTweakFragmentForType, // DEPRECATED, replaced by pgTweakFragmentForTypeAndModifier
    });
  });
}: Plugin);
