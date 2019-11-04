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
import { EventEmitter } from "events";

type mixed = {} | string | number | boolean | undefined | null;

export interface Options {
  [str: string]: any;
}

export interface Plugin {
  (builder: SchemaBuilder, options: Options): Promise<void> | void;
  displayName?: string;
}

export type TriggerChangeType = () => void;
export type WatchUnwatch = (triggerChange: TriggerChangeType) => void;

export type SchemaListener = (newSchema: GraphQLSchema) => void;
export type DataForType = {
  [str: string]: Array<mixed>;
};

export type InitObject = never;

import { Build, Inflection } from "./makeNewBuild";
export { Build, Inflection };

export interface Scope<Type> {
  [str: string]: any;
}
export interface Context<Type> {
  scope: Scope<Type>;
  [str: string]: any;
}

export interface Hook<Type, Builder> {
  (input: Type, build: Builder, context: Context<Type>): Type;
  displayName?: string;
  provides?: Array<string>;
  before?: Array<string>;
  after?: Array<string>;
}

export default class SchemaBuilder extends EventEmitter {
  hook(
    hookName: "build",
    fn: Hook<Build, BuildFor_build>,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "inflection",
    fn: Hook<Inflection, BuildFor_inflection>,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "init",
    fn: Hook<InitObject, BuildFor_init>,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "GraphQLSchema",
    fn: Hook<GraphQLSchemaConfig, BuildFor_GraphQLSchema>,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook<TSource, TContext>(
    hookName: "GraphQLObjectType",
    fn: Hook<
      GraphQLObjectTypeConfig<TSource, TContext>,
      BuildFor_GraphQLObjectType
    >,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "GraphQLObjectType:interfaces",
    fn: Hook<
      Array<GraphQLInterfaceType>,
      BuildFor_GraphQLObjectType_interfaces
    >,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook<TSource, TContext>(
    hookName: "GraphQLObjectType:fields",
    fn: Hook<
      GraphQLFieldConfigMap<TSource, TContext>,
      BuildFor_GraphQLObjectType_fields
    >,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook<TSource, TContext>(
    hookName: "GraphQLObjectType:fields:field",
    fn: Hook<
      GraphQLFieldConfig<TSource, TContext>,
      BuildFor_GraphQLObjectType_fields_field
    >,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "GraphQLObjectType:fields:field:args",
    fn: Hook<
      GraphQLFieldConfigArgumentMap,
      BuildFor_GraphQLObjectType_fields_field_args
    >,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "GraphQLInputObjectType",
    fn: Hook<GraphQLInputObjectTypeConfig, BuildFor_GraphQLInputObjectType>,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "GraphQLInputObjectType:fields",
    fn: Hook<
      GraphQLInputFieldConfigMap,
      BuildFor_GraphQLInputObjectType_fields
    >,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "GraphQLInputObjectType:fields:field",
    fn: Hook<
      GraphQLInputFieldConfig,
      BuildFor_GraphQLInputObjectType_fields_field
    >,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "GraphQLEnumType",
    fn: Hook<GraphQLEnumTypeConfig, BuildFor_GraphQLEnumType>,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "GraphQLEnumType:values",
    fn: Hook<GraphQLEnumValueConfigMap, BuildFor_GraphQLEnumType_values>,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "GraphQLEnumType:values:value",
    fn: Hook<GraphQLEnumValueConfig, BuildFor_GraphQLEnumType_values_value>,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook<TSource, TContext>(
    hookName: "GraphQLUnionType",
    fn: Hook<
      GraphQLUnionTypeConfig<TSource, TContext>,
      BuildFor_GraphQLUnionType
    >,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "GraphQLUnionType:types",
    fn: Hook<Array<GraphQLObjectType>, BuildFor_GraphQLUnionType_types>,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;
  hook(
    hookName: "finalize",
    fn: Hook<GraphQLSchema, BuildFor_finalize>,
    provides?: Array<string>,
    before?: Array<string>,
    after?: Array<string>
  ): void;

  /*
  applyHooks(
    build: Build,
    hookName: "build",
    input: Build,
    context: Context<Build>,
    debugStr?: string
  ): Build;
  applyHooks(
    build: Build,
    hookName: "inflection",
    input: Inflection,
    context: Context<Inflection>,
    debugStr?: string
  ): Inflection;
  applyHooks(
    build: Build,
    hookName: "init",
    input: InitObject,
    context: Context<InitObject>,
    debugStr?: string
  ): InitObject;
  applyHooks(
    build: Build,
    hookName: "GraphQLSchema",
    input: GraphQLSchema,
    context: Context<GraphQLSchema>,
    debugStr?: string
  ): GraphQLSchema;
  applyHooks(
    build: Build,
    hookName: "GraphQLObjectType",
    input: GraphQLObjectType,
    context: Context<GraphQLObjectType>,
    debugStr?: string
  ): GraphQLObjectType;
  applyHooks(
    build: Build,
    hookName: "GraphQLObjectType:interfaces",
    input: Array<GraphQLInterfaceType>,
    context: Context<Array<GraphQLInterfaceType>>,
    debugStr?: string
  ): Array<GraphQLInterfaceType>;
  applyHooks(
    build: Build,
    hookName: "GraphQLObjectType:fields",
    input: GraphQLFieldConfigMap,
    context: Context<GraphQLFieldConfigMap>,
    debugStr?: string
  ): GraphQLFieldConfigMap;
  applyHooks(
    build: Build,
    hookName: "GraphQLObjectType:fields:field",
    input: GraphQLFieldConfig,
    context: Context<GraphQLFieldConfig>,
    debugStr?: string
  ): GraphQLFieldConfig;
  applyHooks(
    build: Build,
    hookName: "GraphQLObjectType:fields:field:args",
    input: GraphQLFieldConfigArgumentMap,
    context: Context<GraphQLFieldConfigArgumentMap>,
    debugStr?: string
  ): GraphQLFieldConfigArgumentMap;
  applyHooks(
    build: Build,
    hookName: "GraphQLInputObjectType",
    input: GraphQLInputObjectType,
    context: Context<GraphQLInputObjectType>,
    debugStr?: string
  ): GraphQLInputObjectType;
  applyHooks(
    build: Build,
    hookName: "GraphQLInputObjectType:fields",
    input: GraphQLInputObjectConfigFieldMap,
    context: Context<GraphQLInputObjectConfigFieldMap>,
    debugStr?: string
  ): GraphQLInputObjectConfigFieldMap;
  applyHooks(
    build: Build,
    hookName: "GraphQLInputObjectType:fields:field",
    input: GraphQLInputObjectFieldConfig,
    context: Context<GraphQLInputObjectFieldConfig>,
    debugStr?: string
  ): GraphQLInputObjectFieldConfig;
  applyHooks(
    build: Build,
    hookName: "GraphQLEnumType",
    input: GraphQLEnumType,
    context: Context<GraphQLEnumType>,
    debugStr?: string
  ): GraphQLEnumType;
  applyHooks(
    build: Build,
    hookName: "GraphQLEnumType:values",
    input: GraphQLEnumValueConfigMap,
    context: Context<GraphQLEnumValueConfigMap>,
    debugStr?: string
  ): GraphQLEnumValueConfigMap;
  applyHooks(
    build: Build,
    hookName: "GraphQLEnumType:values:value",
    input: GraphQLEnumValueConfig,
    context: Context<GraphQLEnumValueConfig>,
    debugStr?: string
  ): GraphQLEnumValueConfig;
  */

  registerWatcher(listen: WatchUnwatch, unlisten: WatchUnwatch): void;

  createBuild(): Build;

  buildSchema(): GraphQLSchema;

  watchSchema(listener?: SchemaListener): Promise<void>;

  unwatchSchema(): Promise<void>;
}

export interface BuildPropertiesIntroducedIn_build {}
export interface BuildPropertiesIntroducedIn_inflection {}
export interface BuildPropertiesIntroducedIn_init {}
export interface BuildPropertiesIntroducedIn_GraphQLSchema {}
export interface BuildPropertiesIntroducedIn_GraphQLObjectType {}
export interface BuildPropertiesIntroducedIn_GraphQLObjectType_interfaces {}
export interface BuildPropertiesIntroducedIn_GraphQLObjectType_fields {}
export interface BuildPropertiesIntroducedIn_GraphQLObjectType_fields_field {}
export interface BuildPropertiesIntroducedIn_GraphQLObjectType_fields_field_args {}
export interface BuildPropertiesIntroducedIn_GraphQLInputObjectType {}
export interface BuildPropertiesIntroducedIn_GraphQLInputObjectType_fields {}
export interface BuildPropertiesIntroducedIn_GraphQLInputObjectType_fields_field {}
export interface BuildPropertiesIntroducedIn_GraphQLEnumType {}
export interface BuildPropertiesIntroducedIn_GraphQLEnumType_values {}
export interface BuildPropertiesIntroducedIn_GraphQLEnumType_values_value {}
export interface BuildPropertiesIntroducedIn_GraphQLUnionType {}
export interface BuildPropertiesIntroducedIn_GraphQLUnionType_types {}
export interface BuildPropertiesIntroducedIn_finalize {}

interface BuildPropertiesIntroducedBefore_build extends Build {}
interface BuildPropertiesIntroducedBefore_inflection
  extends BuildPropertiesIntroducedBefore_build,
    BuildPropertiesIntroducedIn_build {}
interface BuildPropertiesIntroducedBefore_init
  extends BuildPropertiesIntroducedBefore_inflection,
    BuildPropertiesIntroducedIn_inflection {}
interface BuildPropertiesIntroducedBefore_GraphQLSchema
  extends BuildPropertiesIntroducedBefore_init,
    BuildPropertiesIntroducedIn_init {}
interface BuildPropertiesIntroducedBefore_GraphQLObjectType
  extends BuildPropertiesIntroducedBefore_GraphQLSchema,
    BuildPropertiesIntroducedIn_GraphQLSchema {}
interface BuildPropertiesIntroducedBefore_GraphQLObjectType_interfaces
  extends BuildPropertiesIntroducedBefore_GraphQLObjectType,
    BuildPropertiesIntroducedIn_GraphQLObjectType {}
interface BuildPropertiesIntroducedBefore_GraphQLObjectType_fields
  extends BuildPropertiesIntroducedBefore_GraphQLObjectType_interfaces,
    BuildPropertiesIntroducedIn_GraphQLObjectType_interfaces {}
interface BuildPropertiesIntroducedBefore_GraphQLObjectType_fields_field
  extends BuildPropertiesIntroducedBefore_GraphQLObjectType_fields,
    BuildPropertiesIntroducedIn_GraphQLObjectType_fields {}
interface BuildPropertiesIntroducedBefore_GraphQLObjectType_fields_field_args
  extends BuildPropertiesIntroducedBefore_GraphQLObjectType_fields_field,
    BuildPropertiesIntroducedIn_GraphQLObjectType_fields_field {}
interface BuildPropertiesIntroducedBefore_GraphQLInputObjectType
  extends BuildPropertiesIntroducedBefore_GraphQLObjectType_fields_field_args,
    BuildPropertiesIntroducedIn_GraphQLObjectType_fields_field_args {}
interface BuildPropertiesIntroducedBefore_GraphQLInputObjectType_fields
  extends BuildPropertiesIntroducedBefore_GraphQLInputObjectType,
    BuildPropertiesIntroducedIn_GraphQLInputObjectType {}
interface BuildPropertiesIntroducedBefore_GraphQLInputObjectType_fields_field
  extends BuildPropertiesIntroducedBefore_GraphQLInputObjectType_fields,
    BuildPropertiesIntroducedIn_GraphQLInputObjectType_fields {}
interface BuildPropertiesIntroducedBefore_GraphQLEnumType
  extends BuildPropertiesIntroducedBefore_GraphQLInputObjectType_fields_field,
    BuildPropertiesIntroducedIn_GraphQLInputObjectType_fields_field {}
interface BuildPropertiesIntroducedBefore_GraphQLEnumType_values
  extends BuildPropertiesIntroducedBefore_GraphQLEnumType,
    BuildPropertiesIntroducedIn_GraphQLEnumType {}
interface BuildPropertiesIntroducedBefore_GraphQLEnumType_values_value
  extends BuildPropertiesIntroducedBefore_GraphQLEnumType_values,
    BuildPropertiesIntroducedIn_GraphQLEnumType_values {}
interface BuildPropertiesIntroducedBefore_GraphQLUnionType
  extends BuildPropertiesIntroducedBefore_GraphQLEnumType_values_value,
    BuildPropertiesIntroducedIn_GraphQLEnumType_values_value {}
interface BuildPropertiesIntroducedBefore_GraphQLUnionType_types
  extends BuildPropertiesIntroducedBefore_GraphQLUnionType,
    BuildPropertiesIntroducedIn_GraphQLUnionType {}
interface BuildPropertiesIntroducedBefore_finalize
  extends BuildPropertiesIntroducedBefore_GraphQLUnionType_types,
    BuildPropertiesIntroducedIn_GraphQLUnionType_types {}

interface BuildFor_build
  extends BuildPropertiesIntroducedBefore_build,
    Partial<BuildPropertiesIntroducedIn_build> {}
interface BuildFor_inflection
  extends BuildPropertiesIntroducedBefore_inflection,
    Partial<BuildPropertiesIntroducedIn_inflection> {}
interface BuildFor_init
  extends BuildPropertiesIntroducedBefore_init,
    Partial<BuildPropertiesIntroducedIn_init> {}
interface BuildFor_GraphQLSchema
  extends BuildPropertiesIntroducedBefore_GraphQLSchema,
    Partial<BuildPropertiesIntroducedIn_GraphQLSchema> {}
interface BuildFor_GraphQLObjectType
  extends BuildPropertiesIntroducedBefore_GraphQLObjectType,
    Partial<BuildPropertiesIntroducedIn_GraphQLObjectType> {}
interface BuildFor_GraphQLObjectType_interfaces
  extends BuildPropertiesIntroducedBefore_GraphQLObjectType_interfaces,
    Partial<BuildPropertiesIntroducedIn_GraphQLObjectType_interfaces> {}
interface BuildFor_GraphQLObjectType_fields
  extends BuildPropertiesIntroducedBefore_GraphQLObjectType_fields,
    Partial<BuildPropertiesIntroducedIn_GraphQLObjectType_fields> {}
interface BuildFor_GraphQLObjectType_fields_field
  extends BuildPropertiesIntroducedBefore_GraphQLObjectType_fields_field,
    Partial<BuildPropertiesIntroducedIn_GraphQLObjectType_fields_field> {}
interface BuildFor_GraphQLObjectType_fields_field_args
  extends BuildPropertiesIntroducedBefore_GraphQLObjectType_fields_field_args,
    Partial<BuildPropertiesIntroducedIn_GraphQLObjectType_fields_field_args> {}
interface BuildFor_GraphQLInputObjectType
  extends BuildPropertiesIntroducedBefore_GraphQLInputObjectType,
    Partial<BuildPropertiesIntroducedIn_GraphQLInputObjectType> {}
interface BuildFor_GraphQLInputObjectType_fields
  extends BuildPropertiesIntroducedBefore_GraphQLInputObjectType_fields,
    Partial<BuildPropertiesIntroducedIn_GraphQLInputObjectType_fields> {}
interface BuildFor_GraphQLInputObjectType_fields_field
  extends BuildPropertiesIntroducedBefore_GraphQLInputObjectType_fields_field,
    Partial<BuildPropertiesIntroducedIn_GraphQLInputObjectType_fields_field> {}
interface BuildFor_GraphQLEnumType
  extends BuildPropertiesIntroducedBefore_GraphQLEnumType,
    Partial<BuildPropertiesIntroducedIn_GraphQLEnumType> {}
interface BuildFor_GraphQLEnumType_values
  extends BuildPropertiesIntroducedBefore_GraphQLEnumType_values,
    Partial<BuildPropertiesIntroducedIn_GraphQLEnumType_values> {}
interface BuildFor_GraphQLEnumType_values_value
  extends BuildPropertiesIntroducedBefore_GraphQLEnumType_values_value,
    Partial<BuildPropertiesIntroducedIn_GraphQLEnumType_values_value> {}
interface BuildFor_GraphQLUnionType
  extends BuildPropertiesIntroducedBefore_GraphQLUnionType,
    Partial<BuildPropertiesIntroducedIn_GraphQLUnionType> {}
interface BuildFor_GraphQLUnionType_types
  extends BuildPropertiesIntroducedBefore_GraphQLUnionType_types,
    Partial<BuildPropertiesIntroducedIn_GraphQLUnionType_types> {}
interface BuildFor_finalize
  extends BuildPropertiesIntroducedBefore_finalize,
    Partial<BuildPropertiesIntroducedIn_finalize> {}
