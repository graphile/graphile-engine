import {
  PgProc,
  PgType,
  PgClass,
  PgAttribute,
  PgConstraint,
} from "graphile-build-pg";
import { GraphQLNamedType } from "graphql";

export interface Build {
  options: any;
  graphileBuildVersion: any;
  versions: any;
  hasVersion(
    packageName: string,
    range: string,
    options?: { includePrerelease?: boolean }
  ): boolean;
  graphql: typeof import("graphql");
  parseResolveInfo: any;
  simplifyParsedResolveInfoFragmentWithType: any;
  getSafeAliasFromAlias: any;
  /** @deprecated */
  getAliasFromResolveInfo: any;
  getSafeAliasFromResolveInfo: any;
  resolveAlias(data: any, _args: any, _context: any, resolveInfo: any): any;
  addType(type: GraphQLNamedType, origin?: string): void;
  getTypeByName(typeName: any): any;
  extend: any;
  newWithHooks(
    Type: any,
    spec: any,
    inScope: any,
    performNonEmptyFieldsCheck?: any
  ): any;
  /** @deprecated */
  fieldDataGeneratorsByType: any;
  fieldDataGeneratorsByFieldNameByType: any;
  fieldArgDataGeneratorsByFieldNameByType: any;

  inflection: Inflection;

  swallowError: any;
  /** @deprecated EXPERIMENTAL, API might change! */

  resolveNode: any;
  status: {
    currentHookName: any;
    currentHookEvent: any;
  };
  liveCoordinator: any;
  scopeByType: Map<any, any>;
  [str: string]: any;
}

export interface Inflection {
  pluralize(...args: any[]): string;
  singularize(...args: any[]): string;
  upperCamelCase(...args: any[]): string;
  camelCase(...args: any[]): string;
  constantCase(...args: any[]): string;
  // Built-in names (allows you to override these in the output schema)
  builtin(...args: any[]): string;
  // When converting a query field to a subscription (live query) field, this allows you to rename it
  live(...args: any[]): string;
  // Try and make something a valid GraphQL 'Name'
  coerceToGraphQLName(name: string): string;
  [key: string]: (...args: any[]) => string;
}
