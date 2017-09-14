// @flow
import isString from "lodash/isString";
import type { Plugin } from "graphile-build";

const defaultPgColumnFilter = (_table, _build, _context) => true;

export default (function PgConnectionArgOrderBy(
  builder,
  { pgInflection: inflection, pgColumnFilter = defaultPgColumnFilter }
) {
  builder.hook("init", (_, build, context) => {
    const {
      newWithHooks,
      pgIntrospectionResultsByKind: introspectionResultsByKind,
      graphql: { GraphQLEnumType },
    } = build;
    introspectionResultsByKind.class
      .filter(table => table.isSelectable)
      .filter(table => !!table.namespace)
      .filter(table => pgColumnFilter(table, build, context))
      .forEach(table => {
        const tableTypeName = inflection.tableType(
          table.name,
          table.namespace.name
        );
        /* const TableOrderByType = */
        newWithHooks(
          GraphQLEnumType,
          {
            name: inflection.orderByType(tableTypeName),
            description: `Methods to use when ordering \`${tableTypeName}\`.`,
            values: {
              NATURAL: {
                value: {
                  alias: null,
                  specs: [],
                },
              },
            },
          },
          {
            pgIntrospection: table,
            isPgRowSortEnum: true,
          }
        );
      });
    return _;
  });
  builder.hook(
    "GraphQLObjectType:fields:field:args",
    (args, build, context) => {
      const { extend, getTypeByName, pgSql: sql } = build;
      const {
        scope: { isPgConnectionField, pgIntrospection: table },
        addArgDataGenerator,
      } = context;
      if (
        !isPgConnectionField ||
        !table ||
        table.kind !== "class" ||
        !table.namespace ||
        !table.isSelectable ||
        !pgColumnFilter(table, build, context)
      ) {
        return args;
      }
      const tableTypeName = inflection.tableType(
        table.name,
        table.namespace.name
      );
      const TableOrderByType = getTypeByName(
        inflection.orderByType(tableTypeName)
      );

      addArgDataGenerator(function connectionOrderBy({ orderBy }) {
        return {
          pgCursorPrefix:
            orderBy && orderBy.alias && sql.literal(orderBy && orderBy.alias),
          pgQuery: queryBuilder => {
            if (orderBy != null) {
              const { specs, unique } = orderBy;
              const orders =
                Array.isArray(specs[0]) || specs.length === 0 ? specs : [specs];
              orders.forEach(([col, ascending]) => {
                const expr = isString(col)
                  ? sql.fragment`${queryBuilder.getTableAlias()}.${sql.identifier(
                      col
                    )}`
                  : col;
                queryBuilder.orderBy(expr, ascending);
              });
              if (unique) {
                queryBuilder.setOrderIsUnique();
              }
            }
          },
        };
      });
      const defaultValueEnum =
        TableOrderByType.getValues().find(v => v.name === "PRIMARY_KEY_ASC") ||
        TableOrderByType.getValues()[0];

      return extend(args, {
        orderBy: {
          description: `The method to use when ordering \`${tableTypeName}\`.`,
          type: TableOrderByType,
          defaultValue: defaultValueEnum && defaultValueEnum.value,
        },
      });
    }
  );
}: Plugin);
