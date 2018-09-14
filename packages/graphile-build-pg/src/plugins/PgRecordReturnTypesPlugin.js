// @flow
import type { Plugin } from "graphile-build";

export default (function PgRecordReturnTypesPlugin(builder) {
  builder.hook("init", (_, build) => {
    const {
      newWithHooks,
      pgIntrospectionResultsByKind: introspectionResultsByKind,
      pgGetGqlTypeByTypeIdAndModifier,
      graphql: { GraphQLObjectType },
      inflection,
      pgOmit: omit,
      describePgEntity,
      sqlCommentByAddingTags,
    } = build;
    introspectionResultsByKind.procedure
      .filter(proc => !!proc.namespace)
      .filter(proc => !omit(proc, "execute"))
      .forEach(proc => {
        const returnType =
          introspectionResultsByKind.typeById[proc.returnTypeId];
        if (returnType.id !== "2249") {
          return;
        }
        const outputArgNames = proc.argTypeIds.reduce(
          (prev, _, idx) =>
            ["o", "b", "t"].includes(proc.argModes[idx])
              ? [...prev, proc.argNames[idx] || ""]
              : prev,
          []
        );
        const outputArgTypes = proc.argTypeIds.reduce(
          (prev, typeId, idx) =>
            ["o", "b", "t"].includes(proc.argModes[idx])
              ? [...prev, introspectionResultsByKind.typeById[typeId]]
              : prev,
          []
        );
        newWithHooks(
          GraphQLObjectType,
          {
            name: inflection.functionReturnsRecordType(proc),
            description: `The return type of our \`${inflection.functionQueryName(
              proc
            )}\` query.`,
            fields: () =>
              outputArgNames.reduce((memo, outputArgName, idx) => {
                const fieldName = inflection.argument(outputArgName, idx + 1);
                const fieldType = pgGetGqlTypeByTypeIdAndModifier(
                  outputArgTypes[idx].id,
                  null
                );
                return {
                  ...memo,
                  [fieldName]: {
                    type: fieldType,
                    resolve(data) {
                      return outputArgName !== ""
                        ? data[outputArgName]
                        : data[`column${idx + 1}`]; // FIXME?
                    },
                  },
                };
              }, {}),
          },
          {
            __origin: `Adding record return type for ${describePgEntity(
              proc
            )}. You can rename the function's GraphQL field (and its dependent types) via:\n\n  ${sqlCommentByAddingTags(
              proc,
              {
                name: "newNameHere",
              }
            )}`,
            isRecordReturnType: true,
          }
        );
      });
    return _;
  });
}: Plugin);
