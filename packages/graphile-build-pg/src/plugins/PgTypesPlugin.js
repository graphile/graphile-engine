// @flow
import type { Plugin } from "graphile-build";
import { types as pgTypes } from "pg";
import makeGraphQLJSONTypes from "../GraphQLJSON";
import rawParseInterval from "postgres-interval";
import LRU from "lru-cache";

/****************************************************************************************
 * PgTypesPlugin -------------------------------------------------------------------------
 * ---------------------------------------------------------------------------------------
 *
 * ----------------------------------------------------------------------------------------
 * Overview
 * ----------------------------------------------------------------------------------------
 *
 * NOTE: This plugin depends on having the 'introspectionResultsByKind' metadata available
 * which is added by the PgIntrospectionPlugin.
 *
 * Attaches the following functionality to the build object:
 *
 * Todo need descriptions - still unsure of exactly what this is doing
 * 1) Mappers
 *
 *    - pg2gql
 *    - gql2pg
 *    - pg2GqlMapper: mapper from [pgTypeId] -> {map: pg2GqlConverterFn, unmap: gql2pgConverterFn}
 *
 * Todo need better description
 * 2) Tweaks (SQL -> SQL) conversions
 *
 *    - pgTweaksByTypeId: mapper from [pgTypeId] -> tweakFn
 *    - pgTweaksByTypeIdAndModifier: mapper from from [pgTypeId][typeModifier] -> tweakFn
 *    - pgTweakFragmentForTypeAndModifier: (sqlToConvert, pgTypeId, typeModifier) -> newSQL
 *
 * 3) Converters from PostgreSQL types to GQL types
 *
 *    - pgGetGqlTypeByTypeIdAndModifier: (pgTypeId, typeModifier) -> gqlType
 *    - pgGetGqlInputTypeByTypeIdAndModifier: (pgTypeId, typeModifier) -> gqlInputType
 *
 *    The above functions will first try to use any of the generators registerd by the below functions
 *    by subsequent plugins. This enables users to create custom GQL types.
 *    If a generator does not exist for the given typeModifier, they will try to fallback on the 'null'
 *    modifier. If still no generator is found, it falls back to one of the default GQL types. Currently,
 *    the following are supported:
 *
 *      - int2
 *      - int4,
 *      - float4
 *      - float8
 *      - numeric
 *      - money
 *      - interval
 *      - date
 *      - timestamp
 *      - timestamptz
 *      - time
 *      - timetz
 *      - json
 *      - jsonb
 *      - uuid
 *      - bit
 *      - varbit
 *      - char
 *      - text
 *      - varchar
 *      - point
 *      - domain
 *      - range
 *      - enum
 *      - array
 *      - boolean
 *      - number (fallback if pgType is not one of the above numbers)
 *
 * 4) Registering custom PostgreSQL type to GQL type generators
 *
 *    -pgRegisterGqlTypeByTypeId: (pgTypeId, generatorFn, yieldToExisting = false) => void
 *    -pgRegisterGqlInputTypeByTypeId: (pgTypeId, generatorFn, yieldToExisting = false) => void
 *
 *    //TODO not strictly correct?
 *    The generator functions must be of the following form:
 *
 *    (cacheType:(generatedGQLType) => void, typeModifier) => generatedType?
 *
 *    Once the GQL type is generated (potentially using the type modifier), the GQL type MUST
 *    be passed to the cacheType function. It can optionally return the GQL type.
 *
 *    These functions will be used in the coverter functions covered above as the first option
 *    (the will override any default generators provided by this plugin).
 *
 *    By default, if a generator was already registered to the pgTypeId, an error will be thrown.
 *    This can be prevented by setting 'yieldToExisting' to true.
 *
 * ----------------------------------------------------------------------------------------
 * Plugin Conventions
 * ----------------------------------------------------------------------------------------
 * There are several naming conventions used throughout this plugin to avoid confusing the many type:
 *
 *  1) Any information pertaining to PostgreSQL type metadata objects is preceded by 'pgType';
 *  the object itself is called 'pgType' unless it is a known type and then it may be have a specificier
 *  (e.g., 'pgDomainType')
 *
 *  2) GQL types are labled as 'gqlType' if the type is ambiguous. Otherwise, they are fully labeled
 *  and the 'gql' is dropped. (e.g., DomainType)
 *
 *  3) Type modifiers are heavily used throughout many of the component functions. They are always
 *  labeled 'typeModifier' and if being used for lookups are labeled 'typeModifierKey'. The default
 *  type modifier is 'null'.
 *
 * ----------------------------------------------------------------------------------------
 * TODO Outstanding questions/issues
 * ----------------------------------------------------------------------------------------
 * 1) For specific code related questions, I've marked todo tags throughout. These are more general
 *
 * 2) Is the above type generator spec correct?
 *
 * 3) 'pgRegisterGqlTypeByTypeId' is a little misleading because it's not really registering types,
 * it's registering generator functions. Consider changing the name in a subsequent release? Can the
 * internal plugin name be changed to something like 'pgRegisterGqlTypeGeneratorById'?
 *
 * 4) The exposure patterns of the component parts of this plugin vary dramatically making it hard to
 * intuit and understanding of how to interoperate with everything. The following things stick out to me:
 *
 * - I really like the way the registration and getting mechanism works for the GQL type getters (3 + 4 above)
 * - The mappers (1 above) directly expose a mapper index, rather than working through a registration function
 * - the 'get' semantics are not used on the mapper functions (pg2gql and gql2pg)
 * - unlike everything every plugin in the suite exposes, gql2pg is not preceed by 'pg'
 * - there is both a 'pgTweaksByTypeId' and 'pgTweaksByTypeIdAndModifier' index. It looks like not
 * using a modifier has been deprecated everywhere else but here?
 * - again, no registration method for tweaks, meaning that to add a tweak, users have to access the indices
 * directly
 *
 * 5) In addition to caching types here in this plugin, it appears we also use the addType function...
 * however, based on the original plugin it seems pretty haphazard what gets added and what doesn't. Is
 * there a particular pattern that I am missing?
 *
 *
 ****************************************************************************************/

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

    /****************************************************************************************
     * Utilities for converting between gql and sq?
     *
     * TODO Need some documentation for these functions - not quite sure what role they
     * are playing yet, or what val is supposed to represent in each case
     *****************************************************************************************/

    const pg2GqlMapper = {};

    const pg2gql = (val, pgType) => {
      if (val == null) {
        return val;
      }

      //todo add some explanation of what this is checking for
      if (val.__isNull) {
        return null;
      }

      if (pg2GqlMapper[pgType.id]) {
        return pg2GqlMapper[pgType.id].map(val);

        //unwrap domain types
      } else if (pgType.domainBaseType) {
        return pg2gql(val, pgType.domainBaseType);

        //array types
      } else if (pgType.isPgArray) {
        if (!Array.isArray(val)) {
          throw new Error(
            `Expected array when converting PostgreSQL data into GraphQL; failing type: '${
              pgType.namespaceName
            }.${pgType.name}'`
          );
        }
        return val.map(v => pg2gql(v, pgType.arrayItemType));

        //if no mapper, simply return the value
      } else {
        return val;
      }
    };

    const gql2pg = (val, pgType, typeModifier) => {
      //deprecation warning
      if (typeModifier === undefined) {
        // eslint-disable-next-line no-console
        console.warn(
          `gql2pg should be called with three arguments, the third being the type modifier (or null);
            ${new Error().stack || ""}`
        );
        typeModifier = null;
      }

      //TODO why are we doing this
      if (val == null) {
        return sql.null;
      }

      //lookup and perform the gql to sql mapping
      if (pg2GqlMapper[pgType.id]) {
        return pg2GqlMapper[pgType.id].unmap(val, typeModifier);

        //unwrap domain types
      } else if (pgType.domainBaseType) {
        return gql2pg(val, pgType.domainBaseType, pgType.domainTypeModifier);

        //array type
      } else if (pgType.isPgArray) {
        if (!Array.isArray(val)) {
          throw new Error(
            `Expected array when converting GraphQL data into PostgreSQL data; failing type: '${
              pgType.namespaceName
            }.${pgType.name}' (type: ${
              pgType === null ? "null" : typeof pgType
            })`
          );
        }
        return sql.fragment`array[${sql.join(
          val.map(v => gql2pg(v, pgType.arrayItemType, typeModifier)),
          ", "
        )}]::${sql.identifier(pgType.namespaceName)}.${sql.identifier(
          pgType.name
        )}`;

        //if no registered type, wrap it like a value
      } else {
        return sql.value(val);
      }
    };

    /*** Provide Some Default Mappings ***/

    //TODO provide labels for what types this handles
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

    // Interval Types
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

    // Money Types
    pg2GqlMapper[790] = {
      map: parseMoney,
      unmap: val => sql.fragment`(${sql.value(val)})::money`,
    };

    // Point Types
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
     * SQL -> SQL Tweaks Based on PostgresSQL types
     *
     * Helps to better build queries
     *****************************************************************************************/

    /*** Tweak definitions ***/
    const tweakToText = fragment => sql.fragment`(${fragment})::text`;

    /*** Tweak oid Mappings ***/
    //TODO this does not appear to be used anywhere; not in here or in any other plugins
    const pgTweaksByTypeIdAndModifer = {};
    const pgTweaksByTypeId = {
      "1186": tweakToText, // interval
      "20": tweakToText,
      "1700": tweakToText,
    };

    /**
     * If the oid is registered on the above mappings, a tweak will be applied to the fragment.
     * Otherwise, it will just return the input fragment.
     *
     * TODO add explanation for type modifier and resolveData (doesn't appear to be used anywhere) once I have them
     *
     * @param sqlFragment
     * @param pgType
     * @param typeModifier
     * @param resolveData
     */
    const pgTweakFragmentForTypeAndModifier = (
      sqlFragment,
      pgType,
      typeModifier = null,
      resolveData
    ) => {
      //TODO not sure why this is supporting modifiers as no modifier are registered anywhere for tweaking
      const typeModifierKey = typeModifier != null ? typeModifier : -1;
      const tweaker =
        (pgTweaksByTypeIdAndModifer[pgType.id] &&
          pgTweaksByTypeIdAndModifer[pgType.id][typeModifierKey]) ||
        pgTweaksByTypeId[pgType.id];

      //if a tweaker is registerd, apply it
      if (tweaker) {
        return tweaker(sqlFragment, resolveData);

        //if domain base type, recur
      } else if (pgType.domainBaseType) {
        // TODO: check that domains don't support atttypemod
        return pgTweakFragmentForTypeAndModifier(
          sqlFragment,
          pgType.domainBaseType,
          pgType.domainBaseTypeModifier,
          resolveData
        );

        //issue warning if it is an array
      } else if (pgType.isPgArray) {
        const error = new Error(
          "Internal graphile-build-pg error: should not attempt to tweak an array, please process array before tweaking (type: `${type.namespaceName}.${type.name}`)"
        );

        // This is to ensure that Graphile core does not introduce these problems //TODO why not always throw?
        if (process.env.NODE_ENV === "test") {
          throw error;
        }
        // eslint-disable-next-line no-console
        console.error(error);
      }

      //by default return the original fragment if no tweaker is registerd
      return sqlFragment;
    };

    /************************************************************************************
     *
     * GQL Type Registers and Generators
     *
     ************************************************************************************/

    /******************************************************************
     * Registering Generators
     ******************************************************************/

    const gqlTypeByTypeIdGenerator = {};
    const gqlInputTypeByTypeIdGenerator = {};

    //TODO these names seem a little misleading because they really register generators
    //TODO while everything else supports modifiers these don't
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

    /******************************************************************
     * Utilities for getting and generating GQL types based on PG types
     ******************************************************************/

    //TODO need a explanation of what this is doing
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

      //TODO seeing this in a lot of places, might want to isolate this in a single
      //function in case it needs to change
      //convert null to -1 for the lookup queries
      const typeModifierKey = typeModifier != null ? typeModifier : -1;

      //make sure that we are always querying instantiated objects
      if (!gqlTypeCache[typeId]) {
        gqlTypeCache[typeId] = {};
      }
      if (!gqlInputTypeCache[typeId]) {
        gqlInputTypeCache[typeId] = {};
      }

      //if the type was cached, simply return it
      let gqlType = gqlTypeCache[typeId][typeModifierKey];
      if (gqlType) return gqlType;

      //try to find a plugin-defined generator
      //todo what is the generator spec?
      const gen = gqlTypeByTypeIdGenerator[typeId];
      if (gen) {
        const set = Type => {
          cacheType(typeId, typeModifierKey, Type);
          gqlType = Type; //had to add this to deal with generators using the set callback without returning a result
        };
        const result = gen(set, typeModifier);
        if (result) {
          //todo why do this check
          if (
            gqlTypeCache[typeId][typeModifierKey] &&
            gqlTypeCache[typeId][typeModifierKey] !== result
          ) {
            throw new Error(
              `Callback and return types differ when defining type for '${typeId}'`
            );
          }
          //TODO there appears to be a lot of redundancy in here, but I need to look
          cacheType(typeId, typeModifierKey, result);
          return result;
        } else if (gqlType) {
          return gqlType;
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

    //TODO add function description
    function getGqlInputTypeByTypeIdAndModifier(typeId, typeModifier = null) {
      // Make sure that the type was actually found during introspection of the database
      if (!introspectionResultsByKind.typeById[typeId]) {
        throw new Error(
          `Type '${typeId}' not present in introspection results`
        );
      }

      // First, load the OUTPUT type (it might register an input type)
      getGqlTypeByTypeIdAndModifier(typeId, typeModifier);

      const typeModifierKey = typeModifier != null ? typeModifier : -1;
      if (!gqlInputTypeCache[typeId]) {
        gqlInputTypeCache[typeId] = {};
      }
      //if the type was cached, simply return it
      let gqlType = gqlInputTypeCache[typeId][typeModifierKey];
      if (gqlType) return gqlType;

      //utilize a generator specified by a plugin
      const gen = gqlInputTypeByTypeIdGenerator[typeId];
      if (gen) {
        const set = Type => {
          cacheType(typeId, typeModifierKey, null, Type);
          gqlType = Type;
        };
        const result = gen(set, typeModifier);
        if (result) {
          if (
            gqlInputTypeCache[typeId][typeModifierKey] &&
            gqlInputTypeCache[typeId][typeModifierKey] !== result
          ) {
            throw new Error(
              `Callback and return types differ when defining type for '${typeId}'`
            );
          }
          //TODO cache type here seems redundant
          cacheType(typeId, typeModifierKey, null, result);
          return result;
        } else if (gqlType) {
          return gqlType;
        }
      }
      // Fall back to default type modifier
      if (typeModifierKey > -1) {
        return getGqlInputTypeByTypeIdAndModifier(typeId, null);
      }
    }

    /* The default GQL type generator to use if none of the subsequent plugins provide the required generators
     *
     * There are four generation options:
     *
     * 1) We have an explicit type matched based on the typeId. Those are found in the oidLookup table
     * 2) If it is a wrapper type, parameterize it based on it's contents
     *     -- Note: this only unwraps a finite amount of times (50) before throwing an error
     * 3) We can also look up a few generic type generators by their category (if applicable)
     * 4) If we cannot find a match in any of those, then we default to a GQLString type.
     *
     *
     *
     * This will cache the results on gqlTypeCache[pgTypeId][typeModifier]. If possible, this function will also generate
     * and cache the corresponding InputType on gqlInputTypeCache[pgTypeId][typeModifier].
     *
     * Since this is meant to only be accessed from the module's exposed typeGetter, we make the following assumptions:
     *
     * 1) pgTypeId refers to a valid PG type and can be found on pgInstrospectionResultsByKind.typeById
     * 2) No type currently exists on gqlTypeCache[pgTypeId][modifierKey]
     * 3) Both gqlTypeCache[pgTypeId] and gqlInputTypeCache[pgTypeId] are instantiated objects
     *
     * We do not check for these things, so the onus is on the caller.
     *
     * Below we  provide the function `getDefaultGQLTypeByPGTypeIdAndModifier` that wraps the logic in
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
        cacheType(pgTypeId, modifierKey, gqlType, gqlInputType);
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
        cacheType(pgTypeId, modifierKey, gqlType);
        return gqlType;
      }

      // Nothing else worked; pass through as string!
      // XXX: consider using stringType(upperFirst(camelCase(`fallback_${type.name}`)), type.description)?
      cacheType(pgTypeId, modifierKey, GraphQLString);
      return GraphQLString;
    };

    /******************************************************************
     * Caching Utility
     ******************************************************************/

    //TODO Not sure if we need the Object.assign here
    const gqlTypeCache = Object.assign({}, build.pgGqlTypeByTypeIdAndModifier);
    const gqlInputTypeCache = Object.assign(
      {},
      build.pgGqlInputTypeByTypeIdAndModifier
    );

    function cacheType(typeId, modifierKey, gqlType, gqlInputType) {
      //TODO check if we are really only supposed to call 'addType' on the gqlType; seemed to be the default behavior in the original
      if (gqlType) {
        gqlTypeCache[typeId][modifierKey] = gqlType;
        addType(getNamedType(gqlType));
      }
      //if explicit, set the input type
      if (gqlInputType) {
        gqlInputTypeCache[typeId][modifierKey] = gqlInputType;

        //fall back on the output type, if possible
      } else if (gqlType && isInputType(gqlType)) {
        gqlInputTypeCache[typeId][modifierKey] = gqlType;
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
        //TODO if we got it via getTypeByName, then it seems a little weird that we are registering? Shouldn't it already be registered?
        RangeInput = getTypeByName(inflection.inputType(Range.name));
        cacheType(pgRangeType.id, modifierKey, Range, RangeInput);
        return Range;
      }

      //otherwise, generate them
      [Range, RangeInput] = generateRangeTypes(ElementType);

      //then register them
      //todo question4self: why is this the only one with a mapper
      cacheType(pgRangeType.id, modifierKey, Range, RangeInput);
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
    function generateRangeMapper(pgRangeType, pgElementType) {
      const typesToNotParse = [
        1186, // interval
        1082, // date
        1114, // timestamp
        1184, // timestamptz
        1083, // time
        1266, // timetz
      ];

      return {
        map: pgRange => {
          const parsed = pgRangeParser.parse(pgRange);
          // Since the value we will get from `parsed.(start|end).value` is a
          // string but our code will expect it to be the value after `pg`
          // parsed it, we pass through to `pg-types` for parsing.
          const pgParse =
            typesToNotParse.indexOf(parseInt(pgElementType.id, 10)) >= 0
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
        gqlInputTypeCache[pgDomainType.domainBaseTypeId][modifierKey];

      //create the regular type
      // Hack stolen from: https://github.com/graphile/postgraphile/blob/ade728ed8f8e3ecdc5fdad7d770c67aa573578eb/src/graphql/schema/type/aliasGqlType.ts#L16
      // $FlowFixMe
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

      cacheType(pgDomainType.id, modifierKey, DomainType, DomainInputType);

      return DomainType;
    }

    /******************************************************************
     * Enum Types
     ******************************************************************/

    function generateAndRegisterGQLEnumType(pgEnumType, modifierKey) {
      const EnumType = generateEnumType(pgEnumType);
      cacheType(pgEnumType.id, modifierKey, EnumType);
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

    /******************************************************************
     * Categorical Types
     ******************************************************************/

    //Maps PostgresQL type.category to generator functions that return the appropriate
    //GQL type
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

    /******************************************************************
     * Specific Default Types Indexed by PostgreSQL oid
     ******************************************************************/

    /***       Custom Type Generators      ***/

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

    /***       Custom Types      ***/
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
    const DateType = stringType("Date", "The day, does not include a time.");
    const DateTimeType = stringType(
      "Datetime",
      "A point in time as described by the [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) standard. May or may not include a timezone."
    );
    const TimeType = stringType(
      "Time",
      "The exact time of day, does not include the date. May or may not have a timezone offset."
    );
    const SimpleJSON = stringType(
      pgLegacyJsonUuid ? "Json" : "JSON",
      "A JavaScript object encoded in the JSON format as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf)."
    );
    const UUIDType = stringType(
      pgLegacyJsonUuid ? "Uuid" : "UUID",
      "A universally unique identifier as defined by [RFC 4122](https://tools.ietf.org/html/rfc4122)."
    );
    const BigInt = stringType(
      "BigInt",
      "A signed eight-byte integer. The upper big integer values are greater then the max value for a JavaScript number. Therefore all big integers will be output as strings and not numbers."
    );
    const { GraphQLJSON, GraphQLJson } = makeGraphQLJSONTypes(graphql);
    const JSONType = pgExtendedTypes
      ? pgLegacyJsonUuid ? GraphQLJson : GraphQLJSON
      : SimpleJSON;

    const BigFloat = stringType(
      "BigFloat",
      "A floating point number that requires more precision than IEEE 754 binary 64"
    );
    const BitString = stringType(
      "BitString",
      "A string representing a series of binary bits"
    );
    const GQLInterval = new GraphQLObjectType({
      name: "Interval",
      description:
        "An interval of time that has passed where the smallest distinct unit is a second.",
      fields: makeIntervalFields(),
    });
    const GQLIntervalInput = new GraphQLInputObjectType({
      name: "IntervalInput",
      description:
        "An interval of time that has passed where the smallest distinct unit is a second.",
      fields: makeIntervalFields(),
    });

    /***       oid Lookup Table      ***/
    const oidLookup = {
      "20": BigInt, // bitint - even though this is int8, it's too big for JS int, so cast to string.
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

    /*** Register the types with builder ***/
    addType(JSONType);
    addType(UUIDType);
    addType(DateType);
    addType(DateTimeType);
    addType(TimeType);
    addType(BigFloat);
    addType(BitString);
    addType(GQLInterval);
    addType(GQLIntervalInput);

    /******************************************************************
     * Deprecated Functions
     *
     * //TODO might consider selecting a release target for complete removal
     ******************************************************************/

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

    if (build.pgGqlTypeByTypeId || build.pgGqlInputTypeByTypeId) {
      // I don't expect anyone to receive this error, because I don't think anyone uses this interface.
      throw new Error(
        "Sorry! This interface is no longer supported because it is not granular enough. It's not hard to port it to the new system - please contact Benjie and he'll walk you through it."
      );
    }

    /******************************************************************
     * Register with Build
     ******************************************************************/

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

/******************************************************************
 * Utility Functions
 ******************************************************************/

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
const identity = _ => _;
const jsonStringify = o => JSON.stringify(o);
