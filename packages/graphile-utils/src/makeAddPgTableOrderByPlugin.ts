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

export interface OrderByAscDescOptions {
  unique?: boolean;
  nulls?: "first" | "last" | "first-iff-ascending" | "last-iff-ascending";
}

export function orderByAscDesc(
  baseName: string,
  columnOrSqlFragment: OrderBySpecIdentity,
  uniqueOrOptions: boolean | OrderByAscDescOptions = false
): MakeAddPgTableOrderByPluginOrders {
  const options =
    typeof uniqueOrOptions === "boolean"
      ? { unique: uniqueOrOptions }
      : uniqueOrOptions ?? {};
  const { unique = false, nulls = "last-iff-ascending" } = options;

  const isValidNullsOption = [
    "first",
    "last",
    "first-iff-ascending",
    "last-iff-ascending",
  ].includes(nulls);

  const nullsOption = isValidNullsOption ? nulls : "last-iff-ascending";

  const ascendingShouldHaveNullsFirst = [
    "first",
    "first-iff-ascending",
  ].includes(nullsOption);

  const descendingShouldHaveNullsFirst = [
    "first",
    "last-iff-ascending",
  ].includes(nullsOption);

  const orders: MakeAddPgTableOrderByPluginOrders = {
    [`${baseName}_ASC`]: {
      value: {
        alias: `${baseName}_ASC`,
        specs: [[columnOrSqlFragment, true, ascendingShouldHaveNullsFirst]],
        unique,
      },
    },
    [`${baseName}_DESC`]: {
      value: {
        alias: `${baseName}_DESC`,
        specs: [[columnOrSqlFragment, false, descendingShouldHaveNullsFirst]],
        unique,
      },
    },
  };

  return orders;
}
