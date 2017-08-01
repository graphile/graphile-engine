// @flow

import sql from "pg-sql2";
import debugFactory from "debug";
import type { Client } from "pg";
import type { SQL, OpaqueSQLQuery } from "pg-sql2";

const debugSql = debugFactory("graphql-build-pg:sql");

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

export default async function viaTemporaryTable(
  pgClient: Client,
  sqlTypeIdentifier: SQL,
  sqlMutationQuery: SQL,
  sqlResultSourceAlias: SQL,
  sqlResultQuery: SQL
) {
  function performQuery(pgClient: Client, sqlQuery: OpaqueSQLQuery) {
    const { text, values } = sql.compile(sqlQuery);
    if (debugSql.enabled) debugSql(text);
    return pgClient.query(text, values);
  }

  const sqlTemporaryTableAlias = sql.identifier(
    `__temporary_${String(Math.random()).replace(/[^0-9]+/g, "")}__`
  );

  await performQuery(
    pgClient,
    sql.query`
      create temporary table ${sqlTemporaryTableAlias} (
        id serial not null,
        row ${sqlTypeIdentifier} not null
      ) on commit drop`
  );

  const sqlMutationAlias = sql.identifier(Symbol());

  await performQuery(
    pgClient,
    sql.query`
      with ${sqlMutationAlias} as (
        ${sqlMutationQuery}
      )
      insert into ${sqlTemporaryTableAlias} (row)
      select ${sqlMutationAlias}::${sqlTypeIdentifier} from ${sqlMutationAlias}`
  );
  return await performQuery(
    pgClient,
    sql.query`
      with ${sqlResultSourceAlias} as (
        select (${sqlTemporaryTableAlias}.row).* from ${sqlTemporaryTableAlias} order by id asc
      )
      ${sqlResultQuery}`
  );
}
