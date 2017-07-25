// @flow

import SchemaBuilder from "./SchemaBuilder";
import {
  StandardTypesPlugin,
  NodePlugin,
  QueryPlugin,
  MutationPlugin,
  ClientMutationIdDescriptionPlugin,
  MutationPayloadQueryPlugin,
} from "./plugins";
import type { GraphQLSchema } from "graphql";

import type { Plugin, Options } from "./SchemaBuilder";

export type {
  Plugin,
  Options,
  Build,
  BuildExtensionQuery,
  Scope,
  Context,
  Hook,
  WatchUnwatch,
  SchemaListener,
} from "./SchemaBuilder";

const getBuilder = async (
  plugins: Array<Plugin>,
  options: Options = {}
): Promise<SchemaBuilder> => {
  const builder = new SchemaBuilder();
  for (const plugin of plugins) {
    builder._setPluginName(plugin.displayName || plugin.name);
    await plugin(builder, options);
    builder._setPluginName(null);
  }
  return builder;
};

const buildSchema = async (
  plugins: Array<Plugin>,
  options: Options = {}
): Promise<GraphQLSchema> => {
  const builder: SchemaBuilder = await getBuilder(plugins, options);
  return builder.buildSchema();
};

const defaultPlugins: Array<Plugin> = [
  StandardTypesPlugin,
  NodePlugin,
  QueryPlugin,
  MutationPlugin,
  ClientMutationIdDescriptionPlugin,
  MutationPayloadQueryPlugin,
];

export {
  StandardTypesPlugin,
  NodePlugin,
  QueryPlugin,
  MutationPlugin,
  ClientMutationIdDescriptionPlugin,
  MutationPayloadQueryPlugin,
};

export { getBuilder, buildSchema, defaultPlugins };
