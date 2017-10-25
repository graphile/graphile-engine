"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _queryFromResolveData = require("../queryFromResolveData");

var _queryFromResolveData2 = _interopRequireDefault(_queryFromResolveData);

var _debug = require("debug");

var _debug2 = _interopRequireDefault(_debug);

var _addStartEndCursor = require("./addStartEndCursor");

var _addStartEndCursor2 = _interopRequireDefault(_addStartEndCursor);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const debugSql = (0, _debug2.default)("graphile-build-pg:sql");

exports.default = async function PgViewPlugin(builder, { pgInflection: inflection }) {
  builder.hook("GraphQLObjectType:fields", (fields, {
    parseResolveInfo,
    getTypeByName,
    pgSql: sql,
    pgIntrospectionResultsByKind: introspectionResultsByKind
  }, { fieldWithHooks, scope: { isRootQuery } }) => {
    if (!isRootQuery) {
      return fields;
    }

    const views = introspectionResultsByKind.class
          .filter(table => table.isSelectable)
          .filter(table => table.namespace)
          .filter(table => table.classKind === 'v')
          .reduce((memo, table) => {
          const tableTypeName = inflection.tableType(table.name, table.namespace.name);
      const TableType = getTypeByName(tableTypeName);
      const ConnectionType = getTypeByName(inflection.connection(TableType.name));
      if (!TableType) {
        throw new Error(`Could not find GraphQL type for table '${table.name}'`);
      }
      const attributes = introspectionResultsByKind.attribute.filter(attr => attr.classId === table.id);
      if (!ConnectionType) {
        throw new Error(`Could not find GraphQL connection type for table '${table.name}'`);
      }
      const hasUniqueId = a => !!a.find(elem => elem.name === 'uniqueId');
      const schema = table.namespace;
      const sqlFullTableName = sql.identifier(schema.name, table.name);
      if (TableType && ConnectionType && hasUniqueId(attributes)) {
        const fieldName = inflection.allRows(table.name, schema.name);
        memo[fieldName] = fieldWithHooks(fieldName, ({ getDataFromParsedResolveInfoFragment }) => {
          return {
            description: `Reads and enables pagination through a set of \`${tableTypeName}\`.`,
            type: ConnectionType,
            args: {},
            async resolve(parent, args, { pgClient }, resolveInfo) {
              const parsedResolveInfoFragment = parseResolveInfo(resolveInfo);
              const resolveData = getDataFromParsedResolveInfoFragment(parsedResolveInfoFragment, resolveInfo.returnType);
              const query = (0, _queryFromResolveData2.default)(sqlFullTableName, undefined, resolveData, {
                withPaginationAsFields: true
              }, builder => {
                builder.beforeLock("orderBy", () => {
                  builder.data.cursorPrefix = ["unique_id_asc"];
                  builder.orderBy(
                    sql.fragment`${builder.getTableAlias()}.${sql.identifier('uniqueId')}`,
                    true
                  );
                  builder.setOrderIsUnique();
                });
              });
              const { text, values } = sql.compile(query);
              if (debugSql.enabled) debugSql(text);
              const { rows: [row] } = await pgClient.query(text, values);
              return (0, _addStartEndCursor2.default)(row);
            }
          };
        }, {
          isPgConnectionField: true,
          pgIntrospection: table
        });
      }
      return memo;
    }, {});

    return { ...fields, ...views };
  });
};
//# sourceMappingURL=PgViewPlugin.js.map
