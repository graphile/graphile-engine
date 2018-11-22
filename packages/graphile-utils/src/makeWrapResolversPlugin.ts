import { SchemaBuilder, Options, Plugin } from "graphile-build";
import { GraphQLFieldResolver, GraphQLResolveInfo } from "graphql";
import { makeFieldHelpers } from "./fieldHelpers";

interface ResolverWrapperFn<
  TSource = any,
  TContext = any,
  TArgs = { [argName: string]: any }
> {
  (
    resolve: GraphQLFieldResolver<TSource, TContext, TArgs>,
    source: TSource,
    args: TArgs,
    context: TContext,
    resolveInfo: GraphQLResolveInfo
  ): any;
}
interface ResolverWrapperRules {
  [typeName: string]: {
    [fieldName: string]: ResolverWrapperFn;
  };
}

interface ResolverWrapperRulesGenerator {
  (options: Options): ResolverWrapperRules;
}

export default function makeWrapResolversPlugin(
  rules: ResolverWrapperRules
): Plugin;
export default function makeWrapResolversPlugin(
  rulesGenerator: ResolverWrapperRulesGenerator
): Plugin;
export default function makeWrapResolversPlugin(
  rulesOrGenerator: ResolverWrapperRules | ResolverWrapperRulesGenerator
): Plugin {
  return (builder: SchemaBuilder, options: Options) => {
    const rules: ResolverWrapperRules =
      typeof rulesOrGenerator === "function"
        ? rulesOrGenerator(options)
        : rulesOrGenerator;
    builder.hook("GraphQLObjectType:fields:field", (field, build, context) => {
      const {
        Self,
        scope: { fieldName },
      } = context;
      const typeRules = rules[Self.name];
      if (!typeRules) return field;
      const resolveWrapper = typeRules[fieldName];
      if (!resolveWrapper) return field;
      const { resolve: oldResolve = (obj: object) => obj[fieldName] } = field;
      return {
        ...field,
        async resolve(...resolveParams) {
          const smartResolve = (...overrideParams: any[]) =>
            // @ts-ignore We're calling it dynamically, allowing the parent to override args.
            oldResolve(
              ...overrideParams.concat(
                resolveParams.slice(overrideParams.length)
              )
            );
          const [source, args, graphqlContext, resolveInfo] = resolveParams;
          const resolveInfoWithHelpers = {
            ...resolveInfo,
            graphile: makeFieldHelpers(
              build,
              context,
              graphqlContext,
              resolveInfo
            ),
          };
          return resolveWrapper(
            smartResolve,
            source,
            args,
            graphqlContext,
            resolveInfoWithHelpers
          );
        },
      };
    });
  };
}
