// @flow
import type { Plugin } from "../SchemaBuilder";

function isValidMutation(Mutation) {
  try {
    if (!Mutation) {
      return false;
    }
    if (Object.keys(Mutation.getFields()).length === 0) {
      return false;
    }
  } catch (e) {
    return false;
  }
  return true;
}

export default (async function MutationPlugin(builder) {
  builder.hook("GraphQLSchema", (schema: {}, build) => {
    const {
      newWithHooks,
      extend,
      graphql: { GraphQLObjectType },
    } = build;
    const Mutation = newWithHooks(
      GraphQLObjectType,
      {
        name: "Mutation",
        description:
          "The root mutation type which contains root level fields which mutate data.",
      },
      {
        __origin: `graphile-build built-in (root mutation type)`,
        isRootMutation: true,
      },
      true
    );
    if (isValidMutation(Mutation)) {
      return extend(schema, {
        mutation: Mutation,
      });
    } else {
      return schema;
    }
  });
}: Plugin);
