import {
  PgClass,
  PgNamespace,
  PgAttribute,
  PgType,
  PgConstraint,
  PgExtension,
  PgIndex,
  PgProc,
} from "graphile-build-pg";
import {
  GraphQLSchema,
  GraphQLSchemaConfig,
  GraphQLObjectTypeConfig,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLInputObjectTypeConfig,
  GraphQLEnumTypeConfig,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLFieldConfig,
  GraphQLEnumValueConfigMap,
  GraphQLEnumValueConfig,
  GraphQLInputFieldConfigMap,
  GraphQLInputFieldConfig,
  GraphQLUnionTypeConfig,
  GraphQLNamedType,
} from "graphql";

import "graphile-build";
declare module "graphile-build" {
  interface BuildPropertiesIntroducedIn_build {
    graphileBuildPgVersion: any;
    pgSql: typeof import("pg-sql2");
    pgStrictFunctions: any;
    pgColumnFilter: any;
    pgQueryFromResolveData: any;
    pgAddStartEndCursor: any;
    pgOmit: any;
    pgMakeProcField: any;
    pgParseIdentifier: any;
    pgViaTemporaryTable: any;
    describePgEntity: any;
    pgField: any;
    sqlCommentByAddingTags: any;
    pgPrepareAndRun: any;
  }

  type Keys = Array<{
    column: string;
    table: string;
    schema?: string;
  }>;

  interface Inflection {
    conditionType(typeName: string): string;
    inputType(typeName: string): string;
    rangeBoundType(typeName: string): string;
    rangeType(typeName: string): string;
    patchType(typeName: string): string;
    baseInputType(typeName: string): string;
    patchField(itemName: string): string;
    orderByType(typeName: string): string;
    edge(typeName: string): string;
    connection(typeName: string): string;
    _functionName(proc: PgProc): string;
    _typeName(type: PgType): string;
    _tableName(table: PgClass): string;
    _singularizedTableName(table: PgClass): string;
    _columnName(attr: PgAttribute, _options?: { skipRowId?: boolean }): string;
    enumType(type: PgType): string;
    argument(name: string | undefined, index: number): string;
    orderByEnum(columnName: unknown, ascending: unknown): string;
    orderByColumnEnum(attr: PgAttribute, ascending: boolean): string;
    orderByComputedColumnEnum(
      pseudoColumnName: string,
      proc: PgProc,
      table: PgClass,
      ascending: boolean
    ): string;
    domainType(type: PgType): string;
    enumName(inValue: string): string;
    tableNode(table: PgClass): string;
    tableFieldName(table: PgClass): string;
    allRows(table: PgClass): string;
    allRowsSimple(table: PgClass): string;
    functionMutationName(proc: PgProc): string;
    functionMutationResultFieldName(
      proc: PgProc,
      gqlType: unknown,
      plural: boolean,
      outputArgNames: Array<string>
    ): string;
    functionQueryName(proc: PgProc): string;
    functionQueryNameList(proc: PgProc): string;
    functionPayloadType(proc: PgProc): string;
    functionInputType(proc: PgProc): string;
    functionOutputFieldName(
      proc: PgProc,
      outputArgName: string,
      index: number
    ): string;
    tableType(table: PgClass): string;
    column(attr: PgAttribute): string;
    computedColumn(
      pseudoColumnName: string,
      proc: PgProc,
      _table: PgClass
    ): string;
    computedColumnList(
      pseudoColumnName: string,
      proc: PgProc,
      _table: PgClass
    ): string;
    singleRelationByKeys(
      detailedKeys: Keys,
      table: PgClass,
      _foreignTable: PgClass,
      constraint: PgConstraint
    ): string;
    singleRelationByKeysBackwards(
      detailedKeys: Keys,
      table: PgClass,
      _foreignTable: PgClass,
      constraint: PgConstraint
    ): string;
    manyRelationByKeys(
      detailedKeys: Keys,
      table: PgClass,
      _foreignTable: PgClass,
      constraint: PgConstraint
    ): string;
    manyRelationByKeysSimple(
      detailedKeys: Keys,
      table: PgClass,
      _foreignTable: PgClass,
      constraint: PgConstraint
    ): string;
    rowByUniqueKeys(
      detailedKeys: Keys,
      table: PgClass,
      constraint: PgConstraint
    ): string;
    updateByKeys(
      detailedKeys: Keys,
      table: PgClass,
      constraint: PgConstraint
    ): string;
    deleteByKeys(
      detailedKeys: Keys,
      table: PgClass,
      constraint: PgConstraint
    ): string;
    updateByKeysInputType(
      detailedKeys: Keys,
      table: PgClass,
      constraint: PgConstraint
    ): string;
    deleteByKeysInputType(
      detailedKeys: Keys,
      table: PgClass,
      constraint: PgConstraint
    ): string;
    updateNode(table: PgClass): string;
    deleteNode(table: PgClass): string;
    deletedNodeId(table: PgClass): string;
    updateNodeInputType(table: PgClass): string;
    deleteNodeInputType(table: PgClass): string;
    edgeField(table: PgClass): string;
    recordFunctionReturnType(proc: PgProc): string;
    recordFunctionConnection(proc: PgProc): string;
    recordFunctionEdge(proc: PgProc): string;
    scalarFunctionConnection(proc: PgProc): string;
    scalarFunctionEdge(proc: PgProc): string;
    createField(table: PgClass): string;
    createInputType(table: PgClass): string;
    createPayloadType(table: PgClass): string;
    updatePayloadType(table: PgClass): string;
    deletePayloadType(table: PgClass): string;
    [key: string]: (...args: any[]) => string;
  }
}
