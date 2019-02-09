import { Plugin } from "postgraphile-core";
import { GraphQLObjectType } from "graphql";

const AddQueriesToSubscriptionsPlugin: Plugin = function(
  builder,
  { subscriptions }
) {
  if (!subscriptions) {
    return;
  }
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const { extend, getTypeByName, inflection } = build;
    const {
      scope: { isRootSubscription },
    } = context;
    if (!isRootSubscription) {
      return fields;
    }

    const Query: GraphQLObjectType = getTypeByName(inflection.builtin("Query"));
    const queryFields = Query.getFields();
    const subscriptionFields = Object.keys(queryFields).reduce(
      (memo, queryFieldName) => {
        const queryField = queryFields[queryFieldName];
        memo[queryFieldName] = {
          description: (queryField.description || "") + " (live)",
          type: queryField.type,
          args: (queryField.args || []).reduce((newArgs, arg) => {
            const { name, description, type, defaultValue } = arg;
            newArgs[name] = {
              description,
              type,
              defaultValue,
            };
            return newArgs;
          }, {}),
          resolve: queryField.resolve,
          subscribe: build.liveCoordinator.subscribe,
          deprecationReason: queryField.isDeprecated
            ? queryField.deprecationReason
            : undefined,
        };
        return memo;
      },
      {}
    );
    return extend(fields, subscriptionFields);
  });
};
export default AddQueriesToSubscriptionsPlugin;
