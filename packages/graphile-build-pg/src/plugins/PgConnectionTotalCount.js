// @flow
import type { Plugin } from "graphile-build";

export default (function PgConnectionTotalCount(builder) {
  builder.hook(
    "GraphQLObjectType:fields",
    (fields, build, context) => {
      const {
        extend,
        graphql: { GraphQLInt, GraphQLNonNull },
        pgSql: sql,
      } = build;
      const {
        scope: { isPgRowConnectionType, nodeType },
        fieldWithHooks,
        Self,
      } = context;

      if (!isPgRowConnectionType || !nodeType || !nodeType.name) {
        return fields;
      }

      return extend(
        fields,
        {
          totalCount: fieldWithHooks(
            "totalCount",
            ({ addDataGenerator }) => {
              addDataGenerator(() => {
                return {
                  pgAggregateQuery: aggregateQueryBuilder => {
                    aggregateQueryBuilder.select(
                      sql.fragment`count(1)`,
                      "totalCount"
                    );
                  },
                };
              });
              return {
                description: `The count of *all* \`${nodeType.name}\` you could get from the connection.`,
                type: new GraphQLNonNull(GraphQLInt),
                resolve(parent) {
                  return (
                    (parent.aggregates && parent.aggregates.totalCount) || 0
                  );
                },
              };
            },
            {
              isPgConnectionTotalCountField: true,
            }
          ),
        },
        `Adding totalCount to connection '${Self.name}'`
      );
    },
    ["PgConnectionTotalCount"]
  );
}: Plugin);
