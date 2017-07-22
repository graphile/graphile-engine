// @flow
import debugFactory from "debug";
import makeNewBuild from "./makeNewBuild";
import { bindAll } from "./utils";
import { GraphQLSchema } from "graphql";
import * as graphql from "graphql";
import type { GraphQLType } from "graphql";
import EventEmitter from "events";
import type {
  parseResolveInfo,
  simplifyParsedResolveInfoFragmentWithType,
  getAliasFromResolveInfo,
} from "graphql-parse-resolve-info";

const debug = debugFactory("graphql-builder");

const INDENT = "  ";

export type Plugin = (
  builder: SchemaBuilder,
  options: Object
) => Promise<void> | void;

type TriggerChangeType = () => void;

export type Build = {
  graphql: typeof graphql,
  extend(base: Object, ...sources: Array<Object>): Object,
  getTypeByName(typeName: string): ?GraphQLType,
  newWithHooks<T: GraphQLType | GraphQLSchema>(
    Class<T>,
    spec: {},
    scope: {},
    returnNullOnInvalid?: boolean
  ): ?T,
  parseResolveInfo: parseResolveInfo,
  getAliasFromResolveInfo: getAliasFromResolveInfo,
  simplifyParsedResolveInfoFragmentWithType: simplifyParsedResolveInfoFragmentWithType,
};

export type Context = {
  scope: {
    [string]: mixed,
  },
};

export type Hook<Type: mixed> = (
  input: Type,
  build: Build & Object,
  context: Context
) => Type;

export type WatchUnwatch = (triggerChange: TriggerChangeType) => void;

export type SchemaListener = (newSchema: GraphQLSchema) => void;

class SchemaBuilder extends EventEmitter {
  watchers: Array<WatchUnwatch>;
  unwatchers: Array<WatchUnwatch>;
  triggerChange: ?TriggerChangeType;
  depth: number;
  hooks: {
    [string]: Array<Hook<Object> | Hook<Array<Object>>>,
  };

  _currentPluginName: ?string;
  _generatedSchema: ?GraphQLSchema;
  _explicitSchemaListener: ?SchemaListener;
  _busy: boolean;
  _watching: boolean;

  constructor() {
    super();

    this._busy = false;
    this._watching = false;

    this.watchers = [];
    this.unwatchers = [];

    // Because hooks can nest, this keeps track of how deep we are.
    this.depth = -1;

    this.hooks = {
      // The build object represents the current schema build and is passed to
      // all hooks, hook the 'build' event to extend this object:
      build: [],

      // 'build' phase should not generate any GraphQL objects (because the
      // build object isn't finalised yet so it risks weirdness occurring); so
      // if you need to set up any global types you can do so here.
      init: [],

      // Add 'query', 'mutation' or 'subscription' types in this hook:
      GraphQLSchema: [],

      // When creating a GraphQLObjectType via `newWithHooks`, we'll
      // execute, the following hooks:
      // - 'GraphQLObjectType' to add any root-level attributes, e.g. add a description
      // - 'GraphQLObjectType:interfaces' to add additional interfaces to this object type
      // - 'GraphQLObjectType:fields' to add additional fields to this object type (is
      //   ran asynchronously and gets a reference to the final GraphQL Object as
      //   `Self` in the context)
      GraphQLObjectType: [],
      "GraphQLObjectType:interfaces": [],
      "GraphQLObjectType:fields": [],

      // When creating a GraphQLInputObjectType via `newWithHooks`, we'll
      // execute, the following hooks:
      // - 'GraphQLInputObjectType' to add any root-level attributes, e.g. add a description
      // - 'GraphQLInputObjectType:fields' to add additional fields to this object type (is
      //   ran asynchronously and gets a reference to the final GraphQL Object as
      //   `Self` in the context)
      GraphQLInputObjectType: [],
      "GraphQLInputObjectType:fields": [],

      // When creating a GraphQLEnumType via `newWithHooks`, we'll
      // execute, the following hooks:
      // - 'GraphQLEnumType' to add any root-level attributes, e.g. add a description
      // - 'GraphQLEnumType:values' to add additional values
      GraphQLEnumType: [],
      "GraphQLEnumType:values": [],

      // When you add a field to a GraphQLObjectType, wrap the call with
      // `fieldWithHooks` in order to fire these hooks:
      field: [],
      "field:args": [],

      // When you add a field to a GraphQLInputObjectType, wrap the call with
      // `fieldWithHooks` in order to fire this hook:
      inputField: [],
    };
  }

  _setPluginName(name: ?string) {
    this._currentPluginName = name;
  }

  /*
   * Every hook `fn` takes three arguments:
   * - obj - the object currently being inspected
   * - build - the current build object (which contains a number of utilities and the context of the build)
   * - context - information specific to the current invocation of the hook
   *
   * The function must either return a replacement object for `obj` or `obj` itself
   */
  hook(hookName: string, fn: Hook<Object> | Hook<Array<Object>>) {
    if (!this.hooks[hookName]) {
      throw new Error(`Sorry, '${hookName}' is not a supported hook`);
    }
    if (this._currentPluginName && !fn.displayName) {
      fn.displayName = `${this
        ._currentPluginName}/${hookName}/${fn.displayName ||
        fn.name ||
        "anonymous"}`;
    }
    this.hooks[hookName].push(fn);
  }

  applyHooks<T: Array<Object> | Object>(
    build: Build,
    hookName: string,
    input: T,
    context: Context,
    debugStr: string = ""
  ): T {
    this.depth++;
    try {
      debug(`${INDENT.repeat(this.depth)}[${hookName}${debugStr}]: Running...`);

      // $FlowFixMe
      const hooks: Array<Hook<T>> = this.hooks[hookName];
      if (!hooks) {
        throw new Error(`Sorry, '${hookName}' is not a registered hook`);
      }

      let newObj = input;
      for (const hook: Hook<T> of hooks) {
        this.depth++;
        try {
          const hookDisplayName = hook.displayName || hook.name || "anonymous";
          debug(
            `${INDENT.repeat(
              this.depth
            )}[${hookName}${debugStr}]:   Executing '${hookDisplayName}'`
          );
          newObj = hook(newObj, build, context);
          if (!newObj) {
            throw new Error(
              `Hook '${hook.displayName ||
                hook.name ||
                "anonymous"}' for '${hookName}' returned falsy value`
            );
          }
          debug(
            `${INDENT.repeat(
              this.depth
            )}[${hookName}${debugStr}]:   '${hookDisplayName}' complete`
          );
        } finally {
          this.depth--;
        }
      }

      debug(`${INDENT.repeat(this.depth)}[${hookName}${debugStr}]: Complete`);

      return newObj;
    } finally {
      this.depth--;
    }
  }

  registerWatcher(listen: WatchUnwatch, unlisten: WatchUnwatch) {
    if (!listen || !unlisten) {
      throw new Error("You must provide both a listener and an unlistener");
    }
    this.watchers.push(listen);
    this.unwatchers.push(unlisten);
  }

  createBuild() {
    const initialBuild: Build = makeNewBuild(this);
    const build = this.applyHooks(initialBuild, "build", initialBuild, {
      scope: {},
    });
    // Bind all functions so they can be dereferenced
    bindAll(
      build,
      Object.keys(build).filter(key => typeof build[key] === "function")
    );
    Object.freeze(build);
    this.applyHooks(build, "init", {}, { scope: {} });
    return build;
  }

  buildSchema(): ?GraphQLSchema {
    if (!this._generatedSchema) {
      const build = this.createBuild();
      this._generatedSchema = build.newWithHooks(
        GraphQLSchema,
        {},
        { isSchema: true }
      );
    }
    return this._generatedSchema;
  }

  async watchSchema(listener: SchemaListener) {
    if (this._watching || this._busy) {
      throw new Error("We're already watching this schema!");
    }
    try {
      this._busy = true;
      this._watching = true;
      this._explicitSchemaListener = listener;
      this.triggerChange = () => {
        this._generatedSchema = null;
        // XXX: optionally debounce
        this.emit("schema", this.buildSchema());
      };
      if (listener) {
        this.on("schema", listener);
      }
      for (const fn of this.watchers) {
        await fn(this.triggerChange);
      }
      this.emit("schema", this.buildSchema());
    } finally {
      this._busy = false;
    }
  }

  async unwatchSchema() {
    if (!this._watching || this._busy) {
      throw new Error("We're not watching this schema!");
    }
    this._busy = true;
    try {
      const listener = this._explicitSchemaListener;
      this._explicitSchemaListener = null;
      if (listener) {
        this.removeListener("schema", listener);
      }
      if (this.triggerChange) {
        for (const fn of this.unwatchers) {
          await fn(this.triggerChange);
        }
      }
      this.triggerChange = null;
      this._watching = false;
    } finally {
      this._busy = false;
    }
  }
}

export default SchemaBuilder;
