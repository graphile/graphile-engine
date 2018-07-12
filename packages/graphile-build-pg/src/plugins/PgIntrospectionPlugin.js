// @flow
import type { Plugin } from "graphile-build";
import withPgClient from "../withPgClient";
import { parseTags } from "../utils";
import { readFile as rawReadFile } from "fs";
import debugFactory from "debug";
import chalk from "chalk";
import throttle from "lodash/throttle";
import flatMap from "lodash/flatMap";
import { version } from "../../package.json";
import pg from "pg/lib/index";

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
 * (3) Provides access to the introspection metadata on the build object via `pgIntrospectionResultsByKind`:
 *
 *  This object contains lists of the following PostgreSQL metadata structures
 *
 *    -namespace
 *    -class
 *    -procedure
 *    -type
 *    -attribute
 *    -extension
 *    -constraint
 *
 * Additionally, it has a fex indexed by PostgreSQL oid (a string):
 *
 *    -classById
 *    -namespaceById
 *    -typeById,
 *    -extensionById
 *
 * Finally it has the attributes indexed by class and then identifying number on attributeByClassIdAndNum.
 *
 * See the flow types below for more information about what's contained on `pgIntrospectionResultsByKind`.
 *
 *
 * (4) Registers watchers with the builder in case you want to watch the PostgreSQL database for schema changes;
 * if a watcher see a DB change, it will trigger a build of the schema
 ****************************************************************************************/

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

export type PgIntrospectionResultsByKind = {
  namespace: Array<PgNamespace>,
  class: Array<PgClass>,
  attribute: Array<PgAttribute>,
  type: Array<PgType>,
  constraint: Array<PgConstraint>,
  procedure: Array<PgProc>,
  extension: Array<PgExtension>,
  namespaceById: { [string]: PgNamespace },
  classById: { [string]: PgClass },
  typeById: { [string]: PgType },
  extensionById: { [string]: PgExtension },
  attributeByClassIdAndNum: { [string]: { [number]: PgAttribute } },
};

export type PgIntrospectionPluginOptions = {
  pgConfig: pg.Client | pg.Pool | string,
  pgSchemas: Array<string>,
  pgEnableTags: boolean,
  persistentMemoizeWithKey?: <T>(string, () => T) => T,
  pgThrowOnMissingSchema?: boolean,
  pgIncludeExtensionResources?: boolean,
};

/****************************************************************************************
 * Utilities Functions
 ****************************************************************************************/

function readFile(filename, encoding) {
  return new Promise((resolve, reject) => {
    rawReadFile(filename, encoding, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

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
 * @param includeExtensionResources - True iff should include extension resources; currently, this includes
 * the functions and tables installed by extensions
 * @param memoizationFn - Can be used for caching
 */
async function getRawPGStructuresByKind(
  pgConfig,
  schemas,
  includeExtensionResources,
  memoizationFn
) {
  const cacheKey = `PgIntrospectionPlugin-introspectionResultsByKind-v${version}`;

  //introspect the database and return memoized list of structures by kind (see the
  //above types for the fields on each type)

  return memoizationFn(cacheKey, () =>
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
 * Takes the result of getRawPGStructuresByKind and creates id lookupTable indices for the indicated
 * types
 *
 * @param pgStructuresByKind
 */
function addlookupTableById(pgStructuresByKind) {
  //add "ById" fields for the following kinds
  [
    ["namespace", "namespaceById"],
    ["class", "classById"],
    ["type", "typeById"],
    ["extension", "extensionById"],
  ].forEach(([kind, lookupTableAttr]) => {
    pgStructuresByKind[lookupTableAttr] = pgStructuresByKind[kind].reduce(
      (memo, struct) => {
        memo[struct.id] = struct;
        return memo;
      },
      {}
    );
  });

  //index attributes by both their class and their number;
  pgStructuresByKind.attributeByClassIdAndNum = pgStructuresByKind.attribute.reduce(
    (memo, struct) => {
      const { classId, num } = struct;
      if (!memo.hasOwnProperty(classId)) memo[classId] = {};
      memo[classId][num] = struct;
      return memo;
    },
    {}
  );
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
 * Takes the result of getRawPGStructuresByKind and extracts the tags based on the
 * smart commenting system exposed by the 'parseTags' function from utils
 *
 * See https://www.graphile.org/postgraphile/smart-comments/
 *
 * @param pgStructuresByKind
 * @param smartCommentsEnabled - True iff smart comments are enabled
 */
function addTagsToStructures(pgStructuresByKind, smartCommentsEnabled) {
  Object.keys(pgStructuresByKind).forEach(kind => {
    pgStructuresByKind[kind].forEach(struct => {
      if (smartCommentsEnabled && struct.description) {
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
 * @param idAttr - The ID attribute on each struct in 'arrayOfStructs' to  use in looking up another struct with
 * @param newAttr - The property name by which you want to attach the looked up struct to each struct in arrayOfStructs
 * @param lookupTableTable - An ES6 Map that can be used to look up each struct by its ID (see createStructuresByID)
 * @param missingOk - Should throw error if lookupTableTable does not contain an ID
 */

function relate(
  arrayOfStructs,
  idAttr,
  newAttr,
  lookupTableTable,
  missingOk?: boolean = false
) {
  //lookupTable logic
  const getRelatedStruct = (id, struct) => {
    const relatedStruct = lookupTableTable[id];
    if (!relatedStruct) {
      if (missingOk) return;
      else
        throw new Error(
          `Could not look up '${newAttr}' by '${idAttr}' on '${JSON.stringify(
            struct
          )}'`
        );
    }
    return relatedStruct;
  };

  //apply the lookupTable logic to each struct in the array (can handle both an array of ids and a single id)
  arrayOfStructs.forEach(struct => {
    const id = struct[idAttr];
    if (id)
      struct[newAttr] = Array.isArray(id)
        ? id.map(id => getRelatedStruct(id, struct))
        : getRelatedStruct(id, struct);
  });
}

/**
 * Defines how to rehydrate the structural metadata retrieved from the postgres introspection query. See
 * the 'relate' function below;
 */
type relation = {
  kind: string,
  key: string,
  lookupTable: string,
  newAttr: string,
  missingOk?: boolean,
};

const toRelate: Array<relation> = [
  {
    kind: "class",
    key: "namespaceId",
    lookupTable: "namespaceById",
    newAttr: "namespace",
    missingOk: true,
  },
  {
    kind: "class",
    key: "typeId",
    lookupTable: "typeById",
    newAttr: "type",
  },
  {
    kind: "attribute",
    key: "classId",
    lookupTable: "classById",
    newAttr: "class",
  },
  {
    kind: "attribute",
    key: "typeId",
    lookupTable: "typeById",
    newAttr: "type",
  },
  {
    kind: "procedure",
    key: "namespaceId",
    lookupTable: "namespaceById",
    newAttr: "namespace",
  },
  {
    kind: "type",
    key: "classId",
    lookupTable: "classById",
    newAttr: "class",
    missingOk: true,
  },
  {
    kind: "type",
    key: "domainBaseTypeId",
    lookupTable: "typeById",
    newAttr: "domainBaseType",
    missingOk: true,
  },
  {
    kind: "type",
    key: "arrayItemTypeId",
    lookupTable: "typeById",
    newAttr: "arrayItemType",
    missingOk: true,
  },
  {
    kind: "extension",
    key: "namespaceId",
    lookupTable: "namespaceById",
    newAttr: "namespace",
    missingOk: true,
  },
  {
    kind: "extension",
    key: "configurationClassesId",
    lookupTable: "classById",
    newAttr: "configurationClasses",
    missingOk: true,
  },
];

/**
 * Attaches each attribute struct to it's corresponding class using the ID look up
 * table from 'createStructuresById'
 *
 * @param classStructsById
 * @param attributeStructs
 */

function attachClassAttributes(classStructsById, attributeStructs) {
  //initialize all of the class structs to have no attributes
  Object.values(classStructsById).forEach(struct => {
    // $FlowFixMe
    struct.attributes = [];
  });

  //attach all of the attributes to their corresponding class
  attributeStructs.forEach(struct => {
    classStructsById[struct.classId].attributes.push(struct);
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
 * @param updater - thunk to call when the schema needs to be updated;
 */
function generateWatcher(pgConfig, schemasToWatch, updater) {
  let unwatcher = () => {};

  const watcher = async triggerRebuild => {
    withPgClient(pgConfig, async pgClient => {
      //activate the pg_notify channel with the schema watch query
      const uninstall = await installPgWatch(pgClient);
      //because of the promise, client will remain active until resolve() is called
      return new Promise(resolve => {
        const listener = generateNotificationHandler(
          //throttle the amount of times we can update
          throttle(
            async () => {
              debug(`Schema change detected: re-inspecting schema...`);
              await updater();
              debug(`Schema change detected: re-inspecting schema complete`);
              triggerRebuild();
            },
            750,
            {
              leading: true,
              trailing: true,
            }
          ),
          schemasToWatch
        );
        unwatcher = () => {
          uninstall();
          pgClient.removeListener("notification", listener);
          resolve();
        };

        pgClient.on("notification", listener);
      });
    });

    //when the watcher is registered, update the schema
    await updater();
  };

  return [watcher, unwatcher];
}

/**
 * Creates a pg_notify alert on the WATCH_CHANNEL to enable listening for schema changes; returns
 * the thunk that will unlisten to the channel
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
  //TODO should probably do "drop schema if exists postgraphile_watch cascade;"
  return () =>
    pgClient.query(`unlisten ${WATCH_CHANNEL}`).catch(e => {
      debug(`Error occurred trying to unlisten watch: ${e}`);
    });
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
 * Plugin Definition
 ****************************************************************************************/

export default (async function PgIntrospectionPlugin(
  builder,
  options: PgIntrospectionPluginOptions
) {
  const { pgSchemas, pgConfig } = options;

  if (!Array.isArray(pgSchemas)) {
    throw new Error("Argument 'schemas' (array) is required");
  }

  let introspectionResultsByKind: PgIntrospectionResultsByKind;

  //provide the logic for updating the introspection results asynchronously; needed
  //for the watcher, but also called once during the initial setup
  const updateIntrospectionResults = async () => {
    introspectionResultsByKind = await getIntrospectionResultsByKind(options);
  };
  await updateIntrospectionResults();

  //add the introspection results to the build object
  builder.hook("build", build => {
    return build.extend(build, {
      pgIntrospectionResultsByKind: introspectionResultsByKind,
    });
  });

  //add the watchers to trigger rebuild if necessary
  builder.registerWatcher(
    ...generateWatcher(pgConfig, pgSchemas, updateIntrospectionResults)
  );
}: Plugin);

/* The main workhorse of the plugin; accepts all of the plugin options - see
 * above for details
 */
async function getIntrospectionResultsByKind({
  pgConfig,
  pgSchemas,
  pgEnableTags,
  persistentMemoizeWithKey = (key, fn) => fn(),
  pgThrowOnMissingSchema = false,
  pgIncludeExtensionResources = false,
}: PgIntrospectionPluginOptions): Promise<PgIntrospectionResultsByKind> {
  //query the PostgresQL database for the relevant meta data
  const introspectionResultsByKind = await getRawPGStructuresByKind(
    pgConfig,
    pgSchemas,
    pgIncludeExtensionResources,
    persistentMemoizeWithKey
  );

  //verify that all of the schemas are present
  verifySchemas(
    introspectionResultsByKind.namespace,
    pgSchemas,
    pgThrowOnMissingSchema
  );

  // parse the smart comments
  addTagsToStructures(introspectionResultsByKind, pgEnableTags);

  //index the structures by ID
  addlookupTableById(introspectionResultsByKind);

  //rehydrate the objects by linking them by their ID fields
  toRelate.forEach(
    ({ kind, key, lookupTable, newAttr, missingOk }: relation) => {
      relate(
        introspectionResultsByKind[kind],
        key,
        newAttr,
        introspectionResultsByKind[lookupTable],
        missingOk
      );
    }
  );
  attachClassAttributes(
    introspectionResultsByKind.classById,
    introspectionResultsByKind.attribute
  );

  return introspectionResultsByKind;
}
