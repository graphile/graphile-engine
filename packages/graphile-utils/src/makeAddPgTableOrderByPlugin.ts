// BELOW HERE, IMPORTS ARE ONLY TYPES (not values)
import type { SQL, QueryBuilder } from "graphile-build-pg";
import type { Build, Plugin } from "graphile-build";

type OrderBySpecIdentity =
  | string
  | SQL
  | ((options: { queryBuilder: QueryBuilder }) => SQL);

type OrderSpec =
  | [OrderBySpecIdentity, boolean]
  | [OrderBySpecIdentity, boolean, boolean];
export interface MakeAddPgTableOrderByPluginOrders {
  [orderByEnumValue: string]: {
    value: {
      alias?: string;
      specs: Array<OrderSpec>;
      unique: boolean;
    };
  };
}

export default function makeAddPgTableOrderByPlugin(
  schemaName: string,
  tableName: string,
  ordersGenerator: (build: Build) => MakeAddPgTableOrderByPluginOrders,
  hint = `Adding orders with makeAddPgTableOrderByPlugin to "${schemaName}"."${tableName}"`
): Plugin {
  const displayName = `makeAddPgTableOrderByPlugin_${schemaName}_${tableName}`;
  const plugin: Plugin = builder => {
    builder.hook("GraphQLEnumType:values", (values, build, context) => {
      const { extend } = build;
      const {
        scope: { isPgRowSortEnum, pgIntrospection: table },
      } = context;

      if (
        !isPgRowSortEnum ||
        !table ||
        table.kind !== "class" ||
        table.namespaceName !== schemaName ||
        table.name !== tableName
      ) {
        return values;
      }
      const newValues = ordersGenerator(build);

      return extend(values, newValues, hint);
    });
  };
  plugin.displayName = displayName;
  return plugin;
}

export function orderByAscDesc(
  baseName: string,
  columnOrSqlFragment: OrderBySpecIdentity,
  unique = false,
  options?: { createNullsFirst?: boolean; createNullsLast?: boolean }
): MakeAddPgTableOrderByPluginOrders {
  const createNullsFirst = options?.createNullsFirst || false;
  const createNullsLast = options?.createNullsLast || false;

  const naturals: MakeAddPgTableOrderByPluginOrders = {
    [`${baseName}_ASC`]: {
      value: {
        alias: `${baseName}_ASC`,
        specs: [[columnOrSqlFragment, true]],
        unique,
      },
    },
    [`${baseName}_DESC`]: {
      value: {
        alias: `${baseName}_DESC`,
        specs: [[columnOrSqlFragment, false]],
        unique,
      },
    },
  };

  const nullFirsts: MakeAddPgTableOrderByPluginOrders = createNullsFirst
    ? {
        [`${baseName}_ASC_NULLS_FIRST`]: {
          value: {
            alias: `${baseName}_ASC_NULLS_FIRST`,
            specs: [[columnOrSqlFragment, true, true]],
            unique,
          },
        },
        [`${baseName}_DESC_NULLS_FIRST`]: {
          value: {
            alias: `${baseName}_DESC_NULLS_FIRST`,
            specs: [[columnOrSqlFragment, false, true]],
            unique,
          },
        },
      }
    : {};

  const nullLasts: MakeAddPgTableOrderByPluginOrders = createNullsLast
    ? {
        [`${baseName}_ASC_NULLS_LAST`]: {
          value: {
            alias: `${baseName}_ASC_NULLS_LAST`,
            specs: [[columnOrSqlFragment, true, false]],
            unique,
          },
        },
        [`${baseName}_DESC_NULLS_LAST`]: {
          value: {
            alias: `${baseName}_DESC_NULLS_LAST`,
            specs: [[columnOrSqlFragment, false, false]],
            unique,
          },
        },
      }
    : {};

  return { ...naturals, ...nullFirsts, ...nullLasts };
}
