// @flow
import type { Plugin } from "graphile-build";
import withPgClient from "../withPgClient";
import { readFile as rawReadFile } from "fs";
import pg from "pg";
import debugFactory from "debug";
import chalk from "chalk";
const debug = debugFactory("graphile-build-pg");
const INTROSPECTION_PATH = `${__dirname}/../../res/introspection-query.sql`;
const WATCH_FIXTURES_PATH = `${__dirname}/../../res/watch-fixtures.sql`;

// Ref: https://github.com/postgraphql/postgraphql/tree/master/src/postgres/introspection/object

// THIS IS THE BEGINNING - KB 9/26/2017
// Ref: https://github.com/postgraphql/postgraphql/tree/master/src/postgres/introspection/object
/**
 A namespace is the internal name for a schema in PostgreSql.
 *
 @see https://www.postgresql.org/docs/9.5/static/catalog-pg-namespace.html
 */
// export type PgCatalogNamespace = {
//   kind: "namespace",
//   id: string,
//   name: string,
//   description: string,
// };
/**
 A procedure is a remote function in Postgres. There is much more information
 involved with procedures, this is just the information we need to
 create/call procedures.
 *
 @see https://www.postgresql.org/docs/9.6/static/catalog-pg-proc.html
 */
// export type PgCatalogProcedure = {
//   kind: "procedure",
//   name: string,
//   description: ?string,
//   namespaceId: string,
//   isStrict: boolean,
//   returnsSet: boolean,
//   isStable: boolean,
//   returnTypeId: string,
//   argTypeIds: Array<string>,
//   argNames: Array<string>,
//   argDefaultsNum: number,
//   namespace: PgCatalogNamespace
// };
/**
 A PostgreSql attribute is exclusively just a single attribute on a class.
 Most commonly people would know an attribute as a column.
 *
 @see https://www.postgresql.org/docs/9.5/static/catalog-pg-attribute.html
 */
// export type PgCatalogAttribute = {
//   kind: 'attribute',
//   classId: string,
//   num: number,
//   name: string,
//   description: ?string,
//   typeId: string,
//   isNotNull: boolean,
//   hasDefault: boolean,
//   namespace: PgCatalogNamespace
// };
/**
 Anything in PostgreSQL that has “attributes” (aka columns). Tables are the
 most prominent example of a PostgreSQL class, but a class could also be a
 view, index, or composite type.
 *
 @see https://www.postgresql.org/docs/9.5/static/catalog-pg-class.html
 */
// export type PgCatalogClass = {
//   kind: 'class',
//   id: string,
//   name: string,
//   description: ?string,
//   namespaceId: string,
//   typeId: string,
//   isSelectable: boolean,
//   isInsertable: boolean,
//   isUpdatable: boolean,
//   isDeletable: boolean,
//   namespace: PgCatalogNamespace
// };
/**
 A Postgres constraint is any ruleset that can be defined for a class
 (table). Constraints include check constraints, foreign key constraints,
 primary key constraints, unique constraints and more. We only care about a
 few constraint types.
 *
 @see https://www.postgresql.org/docs/9.5/static/catalog-pg-constraint.html
 */
// export type PgCatalogConstraint =
//   PgCatalogForeignKeyConstraint |
//   PgCatalogPrimaryKeyConstraint |
//   PgCatalogUniqueConstraint
/**
 A foreign key constrains the columns of a table to reference the columns of another
 table.
 */
// export type PgCatalogForeignKeyConstraint = PgCatalogBaseConstraint & {
//   type: 'f',
//   classId: string,
//   foreignClassId: string,
//   keyAttributeNums: Array<number>,
//   foreignKeyAttributeNums: Array<number>
// };
/**
 A primary key indicates the main columns used to identify a single row in a
 table.
 */
// export type PgCatalogPrimaryKeyConstraint = PgCatalogBaseConstraint & {
//   type: 'p',
//   classId: string,
//   keyAttributeNums: Array<number>
// };
/**
 Enforces a unique constraint on some columns. No distinct duplicate values
 will be allowed in the columns specified by this constraint.
 */
// export type PgCatalogUniqueConstraint = PgCatalogBaseConstraint & {
//   type: 'u',
//   classId: string,
//   keyAttributeNums: Array<number>
// };
/**
 The base constraint type which contains common fields.
 *
 @private
 */
// type PgCatalogBaseConstraint = {
//   kind: 'constraint',
//   name: string
// };
/**
 PgCatalogObject is a type that represents all of the different shapes of objects
 that may be returned from our introspection query. To see where the data
 comes from, look at the introspection-query.sql file. The types below are
 just for statically checking the resulting rows of that query.
 */
// export type PgCatalogObject =
//   PgCatalogNamespace |
//   PgCatalogClass |
//   PgCatalogAttribute |
//   PgCatalogType |
//   PgCatalogConstraint |
//   PgCatalogProcedure
/**
 A PostgreSql type can be any type within the PostgreSql database. We use a
 union type so that we can use Typescript’s discriminated union powers.
 Instead of using interfaces with extend, we’ll instead use the & type
 operator.
 *
 @see https://www.postgresql.org/docs/9.5/static/catalog-pg-type.html
 */
// TODO: We should probably make a special case for range types.
// type PgCatalogType =
//   PgCatalogCompositeType |
//   PgCatalogDomainType |
//   PgCatalogEnumType |
//   PgCatalogRangeType |
//   (PgCatalogBaseType & {
//   type: 'b' | 'p',
// })
export default PgCatalogType
/**
 A composite type is a type with an associated class. So any type which may
 have attributes (or fields).
 */
// export type PgCatalogCompositeType = PgCatalogBaseType & {
//   type: 'c',
//   classId: string
// }
/**
 A domain type is a named alias of another type with some extra constraints
 added on top. One such constraint is the is_not_null constraint.
 */
// export type PgCatalogDomainType = PgCatalogBaseType & {
//   type: 'd',
//   domainBaseTypeId: string,
//   domainIsNotNull: boolean
// }
/**
 An enum type is a type with a set of predefined string values. A value of
 an enum type may only be one of those values.
 */
// export type PgCatalogEnumType = PgCatalogBaseType & {
//   type: 'e',
//   enumVariants: Array<string>
// }
/**
 A range type is comprised of two values, a beginning and end. It needs a sub
 type to know the type of the range bounds.
 */
// export type PgCatalogRangeType = PgCatalogBaseType & {
//   type: 'r',
//   rangeSubTypeId: string
// }
/**
 The internal type of common properties on all PgTypes. Really you care
 about PgType, PgType just uses this definition internally to avoid code
 reuse.
 *
 @private
 */
// interface PgCatalogBaseType {
//   kind: 'type',
//   id: string,
//   name: string,
//   description: string | undefined,
//   namespaceId: string,
//   namespaceName: string,
//   arrayItemTypeId: string | null,
//   // The category property is used by the parser to do implicit type casting.
//   // This is helpful for us as we don’t need to create catalog types for every
//   // PostgreSql type. Rather we can group types into “buckets” using this
//   // property.
//   //
//   // @see https://www.postgresql.org/docs/9.5/static/catalog-pg-type.html#CATALOG-TYPCATEGORY-TABLE
//   category: 'A' | 'B' | 'C' | 'D' | 'E' | 'G' | 'I' | 'N' | 'P' | 'S' | 'T' | 'U' | 'V' | 'X'
// }

// THIS IS THE END - KB 9/26/2017

export type Namespace = {
  kind: "namespace",
  id: string,
  name: string,
  description: string,
};

export type Proc = {
  kind: "procedure",
  name: string,
  description: ?string,
  namespaceId: string,
  isStrict: boolean,
  returnsSet: boolean,
  isStable: boolean,
  returnTypeId: string,
  argTypeIds: Array<string>,
  argNames: Array<string>,
  argDefaultsNum: number,
  namespace: Namespace,
};

function readFile(filename, encoding) {
  return new Promise((resolve, reject) => {
    rawReadFile(filename, encoding, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

export default (async function PgIntrospectionPlugin(
  builder,
  { pgConfig, pgSchemas: schemas }
) {
  async function introspect() {
    return withPgClient(pgConfig, async pgClient => {
      // Perform introspection
      if (!Array.isArray(schemas)) {
        throw new Error("Argument 'schemas' (array) is required");
      }
      const introspectionQuery = await readFile(INTROSPECTION_PATH, "utf8");
      const { rows } = await pgClient.query(introspectionQuery, [schemas]);

      const introspectionResultsByKind = rows.reduce(
        (memo, { object }) => {
          memo[object.kind].push(object);
          return memo;
        },
        {
          namespace: [],
          class: [],
          attribute: [],
          type: [],
          constraint: [],
          procedure: [],
        }
      );
      const xByY = (arrayOfX, attrKey) =>
        arrayOfX.reduce((memo, x) => {
          memo[x[attrKey]] = x;
          return memo;
        }, {});
      const xByYAndZ = (arrayOfX, attrKey, attrKey2) =>
        arrayOfX.reduce((memo, x) => {
          memo[x[attrKey]] = memo[x[attrKey]] || {};
          memo[x[attrKey]][x[attrKey2]] = x;
          return memo;
        }, {});
      introspectionResultsByKind.namespaceById = xByY(
        introspectionResultsByKind.namespace,
        "id"
      );
      introspectionResultsByKind.classById = xByY(
        introspectionResultsByKind.class,
        "id"
      );
      introspectionResultsByKind.typeById = xByY(
        introspectionResultsByKind.type,
        "id"
      );
      introspectionResultsByKind.attributeByClassIdAndNum = xByYAndZ(
        introspectionResultsByKind.attribute,
        "classId",
        "num"
      );

      const relate = (
        array,
        newAttr,
        lookupAttr,
        lookup,
        missingOk = false
      ) => {
        array.forEach(entry => {
          const key = entry[lookupAttr];
          const result = lookup[key];
          if (key && !result) {
            if (missingOk) {
              return;
            }
            throw new Error(
              `Could not look up '${newAttr}' by '${lookupAttr}' on '${JSON.stringify(
                entry
              )}'`
            );
          }
          entry[newAttr] = result;
        });
      };

      relate(
        introspectionResultsByKind.class,
        "namespace",
        "namespaceId",
        introspectionResultsByKind.namespaceById,
        true // Because it could be a type defined in a different namespace - which is fine so long as we don't allow querying it directly
      );

      relate(
        introspectionResultsByKind.class,
        "type",
        "typeId",
        introspectionResultsByKind.typeById
      );

      relate(
        introspectionResultsByKind.attribute,
        "class",
        "classId",
        introspectionResultsByKind.classById
      );

      relate(
        introspectionResultsByKind.attribute,
        "type",
        "typeId",
        introspectionResultsByKind.typeById
      );

      relate(
        introspectionResultsByKind.procedure,
        "namespace",
        "namespaceId",
        introspectionResultsByKind.namespaceById
      );

      relate(
        introspectionResultsByKind.type,
        "class",
        "classId",
        introspectionResultsByKind.classById,
        true
      );

      relate(
        introspectionResultsByKind.type,
        "domainBaseType",
        "domainBaseTypeId",
        introspectionResultsByKind.typeById,
        true // Because not all types are domains
      );

      relate(
        introspectionResultsByKind.type,
        "arrayItemType",
        "arrayItemTypeId",
        introspectionResultsByKind.typeById,
        true // Because not all types are arrays
      );

      return introspectionResultsByKind;
    });
  }

  let introspectionResultsByKind = await introspect();

  let pgClient, releasePgClient, listener;

  function stopListening() {
    if (pgClient) {
      pgClient.query("unlisten postgraphql_watch").catch(e => {
        debug(`Error occurred trying to unlisten watch: ${e}`);
      });
      pgClient.removeListener("notification", listener);
    }
    if (releasePgClient) {
      releasePgClient();
      pgClient = null;
    }
  }

  builder.registerWatcher(async triggerRebuild => {
    // In case we started listening before, clean up
    await stopListening();

    // Check we can get a pgClient
    if (pgConfig instanceof pg.Pool) {
      pgClient = await pgConfig.connect();
      releasePgClient = () => pgClient && pgClient.release();
    } else if (typeof pgConfig === "string") {
      pgClient = new pg.Client(pgConfig);
      pgClient.on("error", e => {
        debug("pgClient error occurred: %s", e);
      });
      releasePgClient = () =>
        new Promise((resolve, reject) => {
          if (pgClient) pgClient.end(err => (err ? reject(err) : resolve()));
          else resolve();
        });
      await new Promise((resolve, reject) => {
        if (pgClient) {
          pgClient.connect(err => (err ? reject(err) : resolve()));
        } else {
          resolve();
        }
      });
    } else {
      throw new Error(
        "Cannot watch schema with this configuration - need a string or pg.Pool"
      );
    }
    // Install the watch fixtures.
    const watchSqlInner = await readFile(WATCH_FIXTURES_PATH, "utf8");
    const sql = `begin; ${watchSqlInner}; commit;`;
    try {
      await pgClient.query(sql);
    } catch (error) {
      /* eslint-disable no-console */
      console.warn(
        `${chalk.bold.yellow(
          "Failed to setup watch fixtures in Postgres database"
        )} ️️⚠️`
      );
      console.warn(
        chalk.yellow(
          "This is likely because your Postgres user is not a superuser. If the"
        )
      );
      console.warn(
        chalk.yellow(
          "fixtures already exist, the watch functionality may still work."
        )
      );
      console.warn(
        chalk.yellow("Enable DEBUG='graphile-build-pg' to see the error")
      );
      debug(error);
      /* eslint-enable no-console */
      await pgClient.query("rollback");
    }

    await pgClient.query("listen postgraphql_watch");

    const handleChange = async () => {
      debug(`Schema change detected: re-inspecting schema...`);
      introspectionResultsByKind = await introspect();
      debug(`Schema change detected: re-inspecting schema complete`);
      triggerRebuild();
    };

    listener = async notification => {
      if (notification.channel !== "postgraphql_watch") {
        return;
      }
      try {
        const payload = JSON.parse(notification.payload);
        payload.payload = payload.payload || [];
        if (payload.type === "ddl") {
          const commands = payload.payload
            .filter(
              ({ schema }) => schema == null || schemas.indexOf(schema) >= 0
            )
            .map(({ command }) => command);
          if (commands.length) {
            handleChange();
          }
        } else if (payload.type === "drop") {
          const affectsOurSchemas = payload.payload.some(
            schemaName => schemas.indexOf(schemaName) >= 0
          );
          if (affectsOurSchemas) {
            handleChange();
          }
        } else {
          throw new Error(`Payload type '${payload.type}' not recognised`);
        }
      } catch (e) {
        debug(`Error occurred parsing notification payload: ${e}`);
      }
    };
    pgClient.on("notification", listener);
    introspectionResultsByKind = await introspect();
  }, stopListening);

  builder.hook("build", build => {
    return build.extend(build, {
      pgIntrospectionResultsByKind: introspectionResultsByKind,
    });
  });
}: Plugin);
