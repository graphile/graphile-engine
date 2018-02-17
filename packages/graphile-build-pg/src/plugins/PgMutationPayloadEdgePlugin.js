// @flow
import type { Plugin } from "graphile-build";
import isString from "lodash/isString";

export default (function PgMutationPayloadEdgePlugin(
  builder,
  { pgInflection: inflection }
) {
  builder.hook(
    "GraphQLObjectType:fields",
    (
      fields,
      {
        extend,
        getTypeByName,
        pgGetGqlTypeByTypeId,
        pgSql: sql,
        graphql: { GraphQLList, GraphQLNonNull },
      },
      {
        scope: { isMutationPayload, pgIntrospection, pgIntrospectionTable },
        fieldWithHooks,
        recurseDataGeneratorsForField,
      }
    ) => {
      const table = pgIntrospectionTable || pgIntrospection;
      if (
        !isMutationPayload ||
        !table ||
        table.kind !== "class" ||
        !table.namespace ||
        !table.isSelectable
      ) {
        return fields;
      }
      const TableType = pgGetGqlTypeByTypeId(table.type.id);
      const tableTypeName = TableType.name;
      const TableOrderByType = getTypeByName(
        inflection.orderByType(tableTypeName)
      );
      const TableEdgeType = getTypeByName(inflection.edge(tableTypeName));
      if (!TableEdgeType) {
        return fields;
      }

      const fieldName = inflection.edgeField(table.name, table.namespace.name);
      recurseDataGeneratorsForField(fieldName);
      return extend(fields, {
        [fieldName]: fieldWithHooks(
          fieldName,
          ({ addArgDataGenerator }) => {
            addArgDataGenerator(function connectionOrderBy({ orderBy }) {
              return {
                pgQuery: queryBuilder => {
                  if (orderBy != null) {
                    const aliases = [];
                    const expressions = [];
                    orderBy.forEach(item => {
                      const { alias, specs } = item;
                      const orders = Array.isArray(specs[0]) ? specs : [specs];
                      orders.forEach(([col, _ascending]) => {
                        if (!col) {
                          return;
                        }
                        const expr = isString(col)
                          ? sql.fragment`${queryBuilder.getTableAlias()}.${sql.identifier(
                              col
                            )}`
                          : col;
                        expressions.push(expr);
                      });
                      if (alias == null) return;
                      aliases.push(alias);
                    });
                    if (aliases.length) {
                      queryBuilder.select(
                        sql.fragment`json_build_array(${sql.join(
                          aliases.map(
                            a => sql.fragment`${sql.literal(a)}::text`
                          ),
                          ", "
                        )}, json_build_array(${sql.join(expressions, ", ")}))`,
                        "__order_" + aliases.join("|")
                      );
                    }
                  }
                },
              };
            });

            const defaultValueEnum =
              TableOrderByType.getValues().find(
                v => v.name === "PRIMARY_KEY_ASC"
              ) || TableOrderByType.getValues()[0];
            return {
              description: "An edge for the type. May be used by Relay 1.",
              type: TableEdgeType,
              args: {
                orderBy: {
                  description: `The method to use when ordering \`${tableTypeName}\`.`,
                  type: new GraphQLList(new GraphQLNonNull(TableOrderByType)),
                  defaultValue: defaultValueEnum && defaultValueEnum.value,
                },
              },
              resolve(data, { orderBy }) {
                const order =
                  orderBy && orderBy.some(item => item.alias)
                    ? orderBy.filter(item => item.alias)
                    : null;

                if (!order) {
                  return data.data;
                }
                return Object.assign({}, data.data, {
                  __cursor:
                    data.data[
                      `__order_${order.map(item => item.alias).join("|")}`
                    ],
                });
              },
            };
          },
          {
            isPgMutationPayloadEdgeField: true,
            pgFieldIntrospection: table,
          }
        ),
      });
    }
  );
}: Plugin);
