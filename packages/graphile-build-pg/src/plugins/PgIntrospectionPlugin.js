// @flow
import type { Plugin } from "graphile-build";
import withPgClient from "../withPgClient";
import { parseTags } from "../utils";
import { readFile as rawReadFile } from "fs";
import pg from "pg";
import debugFactory from "debug";
import chalk from "chalk";
import throttle from "lodash/throttle";
import flatMap from "lodash/flatMap";
import { quacksLikePgPool } from "../withPgClient";

import { version } from "../../package.json";

const debug = debugFactory("graphile-build-pg");
const INTROSPECTION_PATH = `${__dirname}/../../res/introspection-query.sql`;
const WATCH_FIXTURES_PATH = `${__dirname}/../../res/watch-fixtures.sql`;

// Ref: https://github.com/graphile/postgraphile/tree/master/src/postgres/introspection/object

export type PgNamespace = {
  kind: "namespace",
  id: string,
  name: string,
  description: ?string,
  tags: { [string]: string },
};

export type PgProc = {
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
  namespace: PgNamespace,
  tags: { [string]: string },
  aclExecutable: boolean,
};

export type PgClass = {
  kind: "class",
  id: string,
  name: string,
  description: ?string,
  classKind: string,
  namespaceId: string,
  namespaceName: string,
  typeId: string,
  isSelectable: boolean,
  isInsertable: boolean,
  isUpdatable: boolean,
  isDeletable: boolean,
  isExtensionConfigurationTable: boolean,
  namespace: PgNamespace,
  type: PgType,
  tags: { [string]: string },
  attributes: [PgAttribute],
  aclSelectable: boolean,
  aclInsertable: boolean,
  aclUpdatable: boolean,
  aclDeletable: boolean,
};

export type PgType = {
  kind: "type",
  id: string,
  name: string,
  description: ?string,
  namespaceId: string,
  namespaceName: string,
  type: string,
  category: string,
  domainIsNotNull: boolean,
  arrayItemTypeId: ?string,
  typeLength: ?number,
  isPgArray: boolean,
  classId: ?string,
  domainBaseTypeId: ?string,
  domainTypeModifier: ?number,
  tags: { [string]: string },
};

export type PgAttribute = {
  kind: "attribute",
  classId: string,
  num: number,
  name: string,
  description: ?string,
  typeId: string,
  typeModifier: number,
  isNotNull: boolean,
  hasDefault: boolean,
  class: PgClass,
  type: PgType,
  namespace: PgNamespace,
  tags: { [string]: string },
  aclSelectable: boolean,
  aclInsertable: boolean,
  aclUpdatable: boolean,
};

export type PgConstraint = {
  kind: "constraint",
  name: string,
  type: string,
  classId: string,
  foreignClassId: ?string,
  description: ?string,
  keyAttributeNums: Array<number>,
  foreignKeyAttributeNums: Array<number>,
  namespace: PgNamespace,
  tags: { [string]: string },
};

export type PgExtension = {
  kind: "extension",
  id: string,
  name: string,
  namespaceId: string,
  relocatable: boolean,
  version: string,
  configurationClassIds?: Array<string>,
  description: ?string,
  tags: { [string]: string },
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
  {
    pgConfig,
    pgSchemas: schemas,
    pgEnableTags,
    persistentMemoizeWithKey = (key, fn) => fn(),
    pgThrowOnMissingSchema = false,
    pgIncludeExtensionResources = false,
  }
) {

  //TODO why have all these nested functions
  async function introspect() {

    if (!Array.isArray(schemas)) {
      throw new Error("Argument 'schemas' (array) is required");
    }

    //TODO find out what the cacheing mechanism is doing
    const cacheKey = `PgIntrospectionPlugin-introspectionResultsByKind-v${version}`;


    //introspect the database and return memoized list of structures by kind (see the
    //above types for the fields on each type)
    const introspectionResultsByKind = await persistentMemoizeWithKey(cacheKey, () =>

      //get a client to the postgres database
      withPgClient(pgConfig, async pgClient => {

        //load and run the query for the structure of the database
        const introspectionQuery = await readFile(INTROSPECTION_PATH, "utf8");
        const { rows } = await pgClient.query(introspectionQuery, [
          schemas,
          pgIncludeExtensionResources,
        ]);

        //sort the structures by kind
        const pgStructuresByKind = rows.reduce(
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
            extension: [],
          }
        );

        // Parse tags from comments (smart commenting system)
        [
          "namespace",
          "class",
          "attribute",
          "type",
          "constraint",
          "procedure",
          "extension",
        ].forEach(kind => {
          pgStructuresByKind[kind].forEach(object => {
            if (pgEnableTags && object.description) {
              const parsed = parseTags(object.description);
              object.tags = parsed.tags;
              object.description = parsed.text;
            } else {
              object.tags = {};
            }
          });
        });

        const extensionConfigurationClassIds = flatMap(
          pgStructuresByKind.extension,
          e => e.configurationClassIds
        );
        pgStructuresByKind.class.forEach(klass => {
          klass.isExtensionConfigurationTable =
            extensionConfigurationClassIds.indexOf(klass.id) >= 0;
        });

        return pgStructuresByKind;
      })
    );

    //extract the schemas found in the database
    const knownSchemas = introspectionResultsByKind.namespace.map(n => n.name);

    //check to see if any of the requested schemas are not actually present in the database
    const missingSchemas = schemas.filter(s => knownSchemas.indexOf(s) < 0);
    if (missingSchemas.length) {
      const errorMessage = `
        You requested to use schema '${schemas.join("', '")}';
        however we couldn't find some of those! Missing schemas are: '${missingSchemas.join("', '")}'
      `;
      if (pgThrowOnMissingSchema) {
        throw new Error(errorMessage);
      } else {
        console.warn("⚠️ WARNING⚠️  " + errorMessage); // eslint-disable-line no-console
      }
    }


    //organize everything by ID
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

    //TODO seems like a confusing namespace convention to put id lookups under kind lookups
    //TODO maybe these should be maps instead of POJO
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
    //TODO maybe just add these straight to the class objects
    introspectionResultsByKind.attributeByClassIdAndNum = xByYAndZ(
      introspectionResultsByKind.attribute,
      "classId",
      "num"
    );
    introspectionResultsByKind.extensionById = xByY(
      introspectionResultsByKind.extension,
      "id"
    );


    /**
     *
     *
     * @param array
     * @param newAttr
     * @param lookupAttr
     * @param lookup
     * @param missingOk
     */
    const relate = (array, newAttr, lookupAttr, lookup, missingOk = false) => {
      array.forEach(entry => {

        //relationship
        const key = entry[lookupAttr];

        if (Array.isArray(key)) {
          entry[newAttr] = key
            .map(innerKey => {
              const result = lookup[innerKey];
              if (innerKey && !result) {
                if (missingOk) {
                  return;
                }
                throw new Error(
                  `Could not look up '${newAttr}' by '${lookupAttr}' ('${innerKey}') on '${JSON.stringify(
                    entry
                  )}'`
                );
              }
              return result;
            })
            .filter(_ => _);
        } else {
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
        }
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

    relate(
      introspectionResultsByKind.extension,
      "namespace",
      "namespaceId",
      introspectionResultsByKind.namespaceById,
      true // Because the extension could be a defined in a different namespace
    );

    relate(
      introspectionResultsByKind.extension,
      "configurationClasses",
      "configurationClassIds",
      introspectionResultsByKind.classById,
      true // Because the configuration table could be a defined in a different namespace
    );

    introspectionResultsByKind.class.forEach(klass => {
      klass.attributes = introspectionResultsByKind.attribute.filter(
        attr => attr.classId === klass.id
      );
    });

    return introspectionResultsByKind;
  }

  let introspectionResultsByKind = await introspect();

  let pgClient, releasePgClient, listener;

  function stopListening() {
    if (pgClient) {
      pgClient.query("unlisten postgraphile_watch").catch(e => {
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
    if (pgConfig instanceof pg.Pool || quacksLikePgPool(pgConfig)) {
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

    await pgClient.query("listen postgraphile_watch");

    const handleChange = throttle(
      async () => {
        debug(`Schema change detected: re-inspecting schema...`);
        introspectionResultsByKind = await introspect();
        debug(`Schema change detected: re-inspecting schema complete`);
        triggerRebuild();
      },
      750,
      {
        leading: true,
        trailing: true,
      }
    );

    listener = async notification => {
      if (notification.channel !== "postgraphile_watch") {
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
