// @flow
import type { Plugin } from "graphile-build";
import withPgClient from "../withPgClient";
import { parseTags } from "../utils";
import { readFile as rawReadFile } from "fs";
import debugFactory from "debug";
import chalk from "chalk";
import once from "lodash/once";
import flatMap from "lodash/flatMap";
import { version } from "../../package.json";

const debug = debugFactory("graphile-build-pg");
const INTROSPECTION_PATH = `${__dirname}/../../res/introspection-query.sql`;
const WATCH_FIXTURES_PATH = `${__dirname}/../../res/watch-fixtures.sql`;
const WATCH_CHANNEL = "postgraphile_watch";

/****************************************************************************************
 * PgIntrospectionPlugin ---------------------------------------------------------------
 * -------------------------------------------------------------------------------------
 *
 * Performs the following operations:
 *
 * (1) Queries the designated PostgreSQL database for some relevant metadata
 * (2) Rehyradates the metadata by connecting related structures by their id fields (most of the metadata
 * links to each other (e.g., classes and attributes, classes and namespaces, etc.)
 * (3) Provides two access layers to the metadata on the build object:
 *  - pgIntrospectionResultsByKind: All the definitions organized by their kind
 *  - pgIntrospectionResultsById: All thee definitions indexed by their unique ids
 * (4) Registers watchers with the builder in case you want to watch the PostgreSQL database for schema changes;
 * if a watcher see a DB change, it will trigger a build of the schema
 ****************************************************************************************/

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
  if (!Array.isArray(schemas)) {
    throw new Error("Argument 'schemas' (array) is required");
  }

  //query the PostgresQL database for the relevant meta data
  const introspectionResultsByKind = await getPGStructuresByKind(
    pgConfig,
    schemas,
    pgIncludeExtensionResources,
    persistentMemoizeWithKey
  );

  //verify that all of the schemas are present
  verifySchemas(
    introspectionResultsByKind.namespace,
    schemas,
    pgThrowOnMissingSchema
  );

  // parse the smart comments
  parseTagsFromStructures(introspectionResultsByKind, pgEnableTags);

  //index the structures by ID
  const introspectionResultsById = createStructuresById(
    introspectionResultsByKind
  );

  //rehydrate the objects by linking them by their ID fields
  toRelate.forEach(({ kind, IdAttr, newAttr, missingOk }: relation) => {
    relate(
      introspectionResultsByKind[kind],
      IdAttr,
      newAttr,
      introspectionResultsById,
      missingOk
    );
  });
  attachClassAttributes(
    introspectionResultsByKind.class,
    introspectionResultsByKind.attribute,
    introspectionResultsById
  );

  //add the introspection results to the build object
  builder.hook("build", build => {
    return build.extend(build, {
      pgIntrospectionResultsByKind: introspectionResultsByKind,

      //TODO verify whether adding this top-level lookupByID is ok
      //pgIntrospectionResultsByID: introspectionResultsById
    });
  });

  //add the watchers to trigger rebuild if necessary
  //TODO I don't think there are any tests for this so need to add some before merging
  //PR
  builder.registerWatcher(...generateWatcher(pgConfig, schemas));
}: Plugin);

/****************************************************************************************
 * Build Extensions - Add two ways to query the PostgreSQL introspection results to the
 * build object; one by 'kind' and the other by 'id'. See below for details
 ****************************************************************************************/

/**
 * Query the postgres server for the following types of structures in the database:
 *
 * namespace - the schemas; from pg_namespace
 * class - anything `relation-like` (e.g., tables, indices, etc.); from pg_class
 * attribute - information about table columns; from pg_attribute
 * type - type information; can be scalars and enums, but are also created for each table in the data base; from pg_type table
 * constraint - information about the various constraints on the table; from pg_constraints
 * procedure - information about the aggregate functions as well as custom procedures; from pg_proc
 * extensions - information about the installed extensions; from pg_extension
 *
 * Returns the structures in an collections of arrays indexed by the above kinds
 *
 * @param pgConfig - The configuration parameters for connecting to the PostgresQL DB
 * @param schemas - The requested schemas to pull from the database
 * @param includeExtensionResources - True iff should include extension resources
 * @param memoizationFn -  A function that needs to have the following structure:
 * (cacheKey, () => pgStructuresByKind) => pgStructuresByKind
 * Can be used for caching; TODO explain how - maybe move the cache to the outside of this function
 */
async function getPGStructuresByKind(
  pgConfig,
  schemas,
  includeExtensionResources,
  memoizationFn
) {
  //TODO find out what the cacheing mechanism is doing
  const cacheKey = `PgIntrospectionPlugin-introspectionResultsByKind-v${version}`;

  //introspect the database and return memoized list of structures by kind (see the
  //above types for the fields on each type)
  return await memoizationFn(cacheKey, () =>
    //get a client to the postgres database
    withPgClient(pgConfig, async pgClient => {
      //load and run the query for the structure of the database
      const introspectionQuery = await readFile(INTROSPECTION_PATH, "utf8");
      const { rows } = await pgClient.query(introspectionQuery, [
        schemas,
        includeExtensionResources,
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
}

/**
 * Takes the result of getPGStructuresByKind and creates an index on all of the containing
 * structures by their ID field; not all structures have an ID field (e.g., attributes), but those that do
 * will have unique IDs (on a per database basis)
 *
 * @param pgStructuresByKind
 */
function createStructuresById(pgStructuresByKind) {
  // put every struct that has an ID field into a single map
  const pgStructureById = {};
  Object.keys(pgStructuresByKind).forEach(kind => {
    pgStructuresByKind[kind].forEach(struct => {
      if (struct.id) {
        pgStructureById[struct.id] = struct;
      }
    });
  });

  //TODO deprecate?
  ["namespace", "class", "type", "extension"].forEach(kind => {
    pgStructuresByKind[kind + "ById"] = pgStructuresByKind[kind].reduce(
      (memo, struct) => {
        memo[struct.id] = struct;
        return memo;
      },
      {}
    );
  });
  pgStructuresByKind.attributeByClassIdAndNum = pgStructuresByKind.attribute.reduce(
    (memo, struct) => {
      const { classId, num } = struct;
      if (!memo.hasOwnProperty(classId)) memo[classId] = {};
      memo[classId][num] = struct;
      return memo;
    },
    {}
  );

  //TODO if yes, can warn about the deprecation via proxies (example below)
  // ["namespaceById", "classById", "typeById", "extensionById", "attributeByClassIdAndNum].forEach(prop => {
  //     console.log(prop);
  //    pgStructuresByKind[prop] = new Proxy(pgStructuresByKind[prop], {
  //        get: function(target, property, rec){
  //            console.warn(`@DeprecationWarning: Accessing postgres data by ID via pgIntrospectionResultsByKind will
  //            soon be deprecated. Please use pgIntrospectionResultsByID instead.`);
  //            return target[property];
  //        }
  //    })
  // });

  return pgStructureById;
}

/**
 * Verifies if the returned PostgresQL structures contain the schemas requested
 *
 * @param namespaces
 * @param requestedSchemas
 * @param throwIfMissing
 */
function verifySchemas(namespaces, requestedSchemas, throwIfMissing) {
  //extract the schemas found in the database
  const knownSchemas = namespaces.map(n => n.name);

  //check to see if any of the requested schemas are not actually present in the database
  const missingSchemas = requestedSchemas.filter(
    s => knownSchemas.indexOf(s) < 0
  );
  if (missingSchemas.length) {
    const errorMessage = `
      You requested to use schema '${requestedSchemas.join("', '")}';
      however we couldn't find some of those! Missing schemas are: '${missingSchemas.join(
        "', '"
      )}'
    `;
    if (throwIfMissing) {
      throw new Error(errorMessage);
    } else {
      console.warn("⚠️ WARNING⚠️  " + errorMessage); // eslint-disable-line no-console
    }
  }
}

/****************************************************************************************
 * Smart Comments - Extract the tags for smart comments
 ****************************************************************************************/

/**
 * Takes the result of getPGStructuresByKind and extracts the tags based on the
 * smart commenting system exposed by the 'parseTags' function from utils
 *
 * See https://www.graphile.org/postgraphile/smart-comments/
 *
 * @param pgStructuresByKind
 * @param smartComments - True iff smart comments are enabled
 */
function parseTagsFromStructures(pgStructuresByKind, smartComments) {
  Object.keys(pgStructuresByKind).forEach(kind => {
    pgStructuresByKind[kind].forEach(struct => {
      if (smartComments && struct.description) {
        const parsed = parseTags(struct.description);
        struct.tags = parsed.tags;
        struct.description = parsed.text;
      } else {
        struct.tags = [];
      }
    });
  });
}

/****************************************************************************************
 * Rehydration Utilties - Links the various PostgreSQL metadata structs by their ID fields
 ****************************************************************************************/

/**
 * Relates ("rehydrates") related structs by their ID fields.
 *
 * For example, Type structs reference their class by the classId field. Calling
 * relate([types], 'classId', 'class', structsByID) will attach the corresponding class struct to each type.
 *
 * @param arrayOfStructs - An array of structs from the initial PG introspection
 * @param IdAttr - The ID attribute on each struct in 'arrayOfStructs' to  use in looking up another struct with
 * @param newAttr - The property name by which you want to attach the looked up struct to each struct in arrayOfStructs
 * @param lookupTable - An ES6 Map that can be used to look up each struct by its ID (see createStructuresByID)
 * @param missingOk - Should throw error if lookupTable does not contain an ID
 */

function relate(
  arrayOfStructs,
  IdAttr,
  newAttr,
  lookupTable,
  missingOk?: boolean = false
) {
  //lookup logic
  const getRelatedStruct = (id, struct) => {
    const relatedStruct = lookupTable[id];
    if (!relatedStruct) {
      if (missingOk) return;
      else
        throw new Error(
          `Could not look up '${newAttr}' by '${IdAttr}' on '${JSON.stringify(
            struct
          )}'`
        );
    }
    return relatedStruct;
  };

  //apply the lookup logic to each struct in the array (can handle both an array of ids and a single id)
  arrayOfStructs.forEach(struct => {
    const id = struct[IdAttr];
    if (id)
      struct[newAttr] = Array.isArray(id)
        ? id.map(id => getRelatedStruct(id, struct))
        : getRelatedStruct(id, struct);
  });
}

/**
 * Defines how to rehydrate the structural metadata retrieved from the postgres introspection query. See
 * the 'relate' function below;
 * //TODO is there a better place to put this?
 */
type relation = {
  kind: string,
  IdAttr: string,
  newAttr: string,
  missingOk?: boolean,
};

const toRelate: Array<relation> = [
  {
    kind: "class",
    IdAttr: "namespaceId",
    newAttr: "namespace",
    missingOk: true,
  },
  {
    kind: "class",
    IdAttr: "typeId",
    newAttr: "type",
  },
  {
    kind: "attribute",
    IdAttr: "classId",
    newAttr: "class",
  },
  {
    kind: "attribute",
    IdAttr: "typeId",
    newAttr: "type",
  },
  {
    kind: "procedure",
    IdAttr: "namespaceId",
    newAttr: "namespace",
  },
  {
    kind: "type",
    IdAttr: "classId",
    newAttr: "class",
    missingOk: true,
  },
  {
    kind: "type",
    IdAttr: "domainBaseTypeId",
    newAttr: "domainBaseType",
    missingOk: true,
  },
  {
    kind: "type",
    IdAttr: "arrayItemTypeId",
    newAttr: "arrayItemType",
    missingOk: true,
  },
  {
    kind: "extension",
    IdAttr: "namespaceId",
    newAttr: "namespace",
    missingOk: true,
  },
  {
    kind: "extension",
    IdAttr: "configurationClassesId",
    newAttr: "configurationClasses",
    missingOk: true,
  },
];

/**
 * Attaches each attribute struct to it's corresponding class using the ID look up
 * table from 'createStructuresById'
 *
 * @param classStructs
 * @param attributeStructs
 * @param lookupTable
 */

function attachClassAttributes(classStructs, attributeStructs, lookupTable) {
  //initialize all of the class structs to have no attributes
  classStructs.forEach(struct => {
    struct.attributes = [];
  });

  //attach all of the attributes to their corresponding class
  attributeStructs.forEach(struct => {
    lookupTable[struct.classId].attributes.push(struct);
  });
}

/****************************************************************************************
 * Watching Utilties - Triggers rebuild if detect a change in schema in PostgresQL DB
 ****************************************************************************************/

/**
 * Generates a [watcher, unwatcher] tuple to register to the builder. The rebuild callback
 * will be triggered whenever a schema change is detected using the watch-fixtures query and
 * pg_notify channels
 *
 * @param pgConfig
 * @param schemasToWatch
 */
function generateWatcher(pgConfig, schemasToWatch) {
  let unwatcher = () => {};

  const watcher = async triggerRebuild => {
    withPgClient(pgConfig, async pgClient => {
      //activate the pg_notify channel with the schema watch query
      await installPgWatch(pgClient);
      //because of the promise, client will remain active until resolve() is called
      return new Promise(resolve => {
        const listener = generateNotificationHandler(
          //the watcher can only trigger unwatching and a rebuild once
          once(() => {
            debug(`Schema change detected: re-inspecting schema...`);
            //call unwatcher before the rebuild so that we always have a clean slate
            unwatcher();
            triggerRebuild();
          }),
          schemasToWatch
        );
        unwatcher = () => {
          pgClient.query(`unlisten ${WATCH_CHANNEL}`).catch(e => {
            debug(`Error occurred trying to unlisten watch: ${e}`);
          });
          pgClient.removeListener("notification", listener);
          resolve();
        };

        pgClient.on("notification", listener);
      });
    });
  };

  return [watcher, unwatcher];
}

/**
 * Creates a pg_notify alert on the WATCH_CHANNEL to enable listening for schema changes
 *
 * @param pgClient
 */
async function installPgWatch(pgClient) {
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
      chalk.bold.yellow(
        "This is likely because your Postgres user is not a superuser. If the"
      )
    );
    console.warn(
      chalk.bold.yellow(
        "fixtures already exist, the watch functionality may still work."
      )
    );
    console.warn(
      chalk.bold.yellow("Enable DEBUG='graphile-build-pg' to see the error")
    );
    debug(error);
    /* eslint-enable no-console */
    await pgClient.query("rollback");
  }
  await pgClient.query(`listen ${WATCH_CHANNEL}`);
  return pgClient;
}

/**
 * Generates the handler will be registered to the schema change channel; calls onSchemaChange()
 * when one of the schemasToWatch changes
 *
 * @param onSchemaChange
 * @param schemasToWatch
 */

function generateNotificationHandler(onSchemaChange, schemasToWatch) {
  return async notification => {
    //only look watch postgraphile notifications
    if (notification.channel !== WATCH_CHANNEL) return;

    try {
      const payload = JSON.parse(notification.payload);
      payload.payload = payload.payload || [];
      if (payload.type === "ddl") {
        const commands = payload.payload
          .filter(
            ({ schema }) =>
              schema == null || schemasToWatch.indexOf(schema) >= 0
          )
          .map(({ command }) => command);
        if (commands.length) {
          onSchemaChange();
        }
      } else if (payload.type === "drop") {
        const affectsOurSchemas = payload.payload.some(
          schemaName => schemasToWatch.indexOf(schemaName) >= 0
        );
        if (affectsOurSchemas) {
          onSchemaChange();
        }
      } else {
        throw new Error(`Payload type '${payload.type}' not recognised`);
      }
    } catch (e) {
      debug(`Error occurred parsing notification payload: ${e}`);
    }
  };
}

/****************************************************************************************
 * Flow Types
 ****************************************************************************************/

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
