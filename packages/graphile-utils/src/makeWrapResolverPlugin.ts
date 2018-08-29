import { SchemaBuilder, Build, Context, Plugin, Options } from "graphile-build";
import { GraphQLFieldResolver, DocumentNode } from "graphql";

export type WrapFunction = <
  TSource,
  TContext,
  TArgs = { [argName: string]: any }
>(
  callOldResolver: () => Promise<any>
) => GraphQLFieldResolver<TSource, TContext, TArgs>;

export default function makeWrapResolverPlugin(
  targetTypeName: string,
  targetFieldName: string,
  wrapFunction: WrapFunction,
  requiredFragment?: DocumentNode /* but we need to avoid conflicts */ /* { id children { thing thong } } */
): Plugin {
  return (builder: SchemaBuilder) => {
    builder.hook(
      "GraphQLObjectType:fields:field",
      (field, build: Build, context: Context<GraphQLFieldConfig>) => {
        const { pgSql: sql } = build;
        const {
          Self,
          scope: { isRootMutation, fieldName },
          addArgDataGenerator,
        } = context;
        if (Self.name !== targetTypeName) {
          return field;
        }
        if (fieldName !== targetFieldName) {
          return field;
        }

        addArgDataGenerator(() => fakeRequest(requiredFragment));

        // We're going to need link.id for our `performAnotherTask`; so we're going
        // to abuse addArgDataGenerator to make sure that this field is ALWAYS
        // requested, even if the user doesn't specify it. We're careful to alias
        // the result to a field that begins with `__` as that's forbidden by
        // GraphQL and thus cannot clash with a user's fields.
        addArgDataGenerator(() => ({
          pgQuery: queryBuilder => {
            queryBuilder.select(
              // Select this value from the result of the INSERT:
              sql.query`${queryBuilder.getTableAlias()}.id`,
              // And give it this name in the result data:
              "__createdRecordId"
            );
          },
        }));

        // It's possible that `resolve` isn't specified on a field, so in that case
        // we fall back to a default resolver.
        const defaultResolver = obj => obj[fieldName];

        // Extract the old resolver from `field`
        const { resolve: oldResolve = defaultResolver, ...rest } = field;

        return {
          // Copy over everything except 'resolve'
          ...rest,

          // Add our new resolver which wraps the old resolver
          resolve(...params) {
            return wrapFunction(() => oldResolve(...params))(...params);
          },
        };
      }
    );
  };
}
