// @flow
import type { Plugin } from "graphql-build";
import queryFromResolveData from "../queryFromResolveData";
import debugFactory from "debug";

const debug = debugFactory("graphql-build-pg");
const debugSql = debugFactory("graphql-build-pg:sql");

export default (function PgMutationCreatePlugin(
  builder,
  { pgInflection: inflection, pgDisableDefaultMutations }
) {
  if (pgDisableDefaultMutations) {
    return;
  }
  builder.hook(
    "GraphQLObjectType:fields",
    (
      fields,
      {
        extend,
        getTypeByName,
        newWithHooks,
        parseResolveInfo,
        pgIntrospectionResultsByKind,
        pgSql: sql,
        gql2pg,
        graphql: {
          GraphQLObjectType,
          GraphQLInputObjectType,
          GraphQLNonNull,
          GraphQLString,
        },
      },
      { scope: { isRootMutation }, fieldWithHooks }
    ) => {
      if (!isRootMutation) {
        return fields;
      }

      return extend(
        fields,
        pgIntrospectionResultsByKind.class
          .filter(table => !!table.namespace)
          .filter(table => table.isSelectable)
          .filter(table => table.isInsertable)
          .reduce((memo, table) => {
            const Table = getTypeByName(
              inflection.tableType(table.name, table.namespace.name)
            );
            if (!Table) {
              debug(
                `There was no table type for table '${table.namespace
                  .name}.${table.name}', so we're not generating a create mutation for it.`
              );
              return memo;
            }
            const TableInput = getTypeByName(inflection.inputType(Table.name));
            if (!TableInput) {
              debug(
                `There was no input type for table '${table.namespace
                  .name}.${table.name}', so we're not generating a create mutation for it.`
              );
              return memo;
            }
            const tableTypeName = inflection.tableType(
              table.name,
              table.namespace.name
            );
            const InputType = newWithHooks(
              GraphQLInputObjectType,
              {
                name: inflection.createInputType(
                  table.name,
                  table.namespace.name
                ),
                description: `All input for the create \`${tableTypeName}\` mutation.`,
                fields: {
                  clientMutationId: {
                    description:
                      "An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client.",
                    type: GraphQLString,
                  },
                  [inflection.tableName(table.name, table.namespace.name)]: {
                    description: `The \`${tableTypeName}\` to be created by this mutation.`,
                    type: new GraphQLNonNull(TableInput),
                  },
                },
              },
              {
                isPgCreateInputType: true,
                pgInflection: table,
              }
            );
            const PayloadType = newWithHooks(
              GraphQLObjectType,
              {
                name: inflection.createPayloadType(
                  table.name,
                  table.namespace.name
                ),
                description: `The output of our create \`${tableTypeName}\` mutation.`,
                fields: ({ recurseDataGeneratorsForField }) => {
                  const tableName = inflection.tableName(
                    table.name,
                    table.namespace.name
                  );
                  recurseDataGeneratorsForField(tableName);
                  return {
                    clientMutationId: {
                      description:
                        "The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations.",
                      type: GraphQLString,
                    },
                    [tableName]: {
                      description: `The \`${tableTypeName}\` that was created by this mutation.`,
                      type: Table,
                      resolve(data) {
                        return data.data;
                      },
                    },
                  };
                },
              },
              {
                isMutationPayload: true,
                isPgCreatePayloadType: true,
                pgIntrospection: table,
              }
            );
            const fieldName = inflection.createField(
              table.name,
              table.namespace.name
            );
            memo[
              fieldName
            ] = fieldWithHooks(
              fieldName,
              ({ getDataFromParsedResolveInfoFragment }) => ({
                description: `Creates a single \`${tableTypeName}\`.`,
                type: PayloadType,
                args: {
                  input: {
                    type: new GraphQLNonNull(InputType),
                  },
                },
                async resolve(data, { input }, { pgClient }, resolveInfo) {
                  const parsedResolveInfoFragment = parseResolveInfo(
                    resolveInfo
                  );
                  const resolveData = getDataFromParsedResolveInfoFragment(
                    parsedResolveInfoFragment,
                    PayloadType
                  );
                  const insertedRowAlias = sql.identifier(Symbol());
                  const query = queryFromResolveData(
                    insertedRowAlias,
                    insertedRowAlias,
                    resolveData,
                    {}
                  );
                  const sqlColumns = [];
                  const sqlValues = [];
                  const inputData =
                    input[
                      inflection.tableName(table.name, table.namespace.name)
                    ];
                  pgIntrospectionResultsByKind.attribute
                    .filter(attr => attr.classId === table.id)
                    .forEach(attr => {
                      const fieldName = inflection.column(
                        attr.name,
                        table.name,
                        table.namespace.name
                      );
                      const val = inputData[fieldName];
                      if (val != null) {
                        sqlColumns.push(sql.identifier(attr.name));
                        sqlValues.push(gql2pg(val, attr.type));
                      }
                    });
                  const temporaryTableAlias = sql.identifier(
                    `__temporary_${String(Math.random()).replace(
                      /[^0-9]+/g,
                      ""
                    )}__`
                  );

                  function performQuery(pgClient, query) {
                    const { text, values } = sql.compile(query);
                    if (debugSql.enabled) debugSql(text);
                    return pgClient.query(text, values);
                  }

                  /*
                   * Originally we tried this with a CTE, but:
                   *
                   * > The sub-statements in WITH are executed concurrently
                   * > with each other and with the main query. Therefore, when
                   * > using data-modifying statements in WITH, the order in
                   * > which the specified updates actually happen is
                   * > unpredictable. All the statements are executed with the
                   * > same snapshot (see Chapter 13), so they cannot "see" one
                   * > another's effects on the target tables. This alleviates
                   * > the effects of the unpredictability of the actual order
                   * > of row updates, and means that RETURNING data is the only
                   * > way to communicate changes between different WITH
                   * > sub-statements and the main query.
                   *
                   * -- https://www.postgresql.org/docs/9.6/static/queries-with.html
                   *
                   * This caused issues with computed columns that themselves
                   * went off and performed selects - because the data within
                   * those selects used the old snapshot and thus returned
                   * stale data. To solve this, we now use temporary tables to
                   * ensure the mutation and the select execute in different
                   * statments.
                   */

                  await performQuery(
                    pgClient,
                    sql.query`
                    create temporary table ${temporaryTableAlias} (
                      id serial not null,
                      row ${sql.identifier(
                        table.namespace.name,
                        table.name
                      )} not null
                    ) on commit drop`
                  );

                  const withBlah = sql.identifier(Symbol());
                  await performQuery(
                    pgClient,
                    sql.query`
                    with ${withBlah} as (
                      insert into ${sql.identifier(
                        table.namespace.name,
                        table.name
                      )} ${sqlColumns.length
                      ? sql.fragment`(
                          ${sql.join(sqlColumns, ", ")}
                        ) values(${sql.join(sqlValues, ", ")})`
                      : sql.fragment`default values`} returning *
                    )
                    insert into ${temporaryTableAlias} (row)
                    select ${withBlah}::${sql.identifier(
                      table.namespace.name,
                      table.name
                    )} from ${withBlah}`
                  );
                  const { rows: [row] } = await performQuery(
                    pgClient,
                    sql.query`
                    with ${insertedRowAlias} as (
                      select (${temporaryTableAlias}.row).* from ${temporaryTableAlias} order by id asc
                    )
                    ${query}`
                  );
                  return {
                    clientMutationId: input.clientMutationId,
                    data: row,
                  };
                },
              })
            );
            return memo;
          }, {})
      );
    }
  );
}: Plugin);
