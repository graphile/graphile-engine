import { Plugin } from "postgraphile-core";
import { GraphQLObjectType } from "graphql";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function* ai() {
  let counter = 0;
  while (true) {
    yield counter++;
    console.log("Tick");
    await sleep(1000);
  }
}

function subscribe() {
  return ai();
}

const SubscriptionFieldsPlugin: Plugin = function(builder) {
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const { extend, getTypeByName, inflection } = build;
    const {
      scope: { isRootSubscription },
    } = context;
    if (!isRootSubscription) {
      return fields;
    }

    console.log("Hello");
    const Query: GraphQLObjectType = getTypeByName(inflection.builtin("Query"));
    const queryFields = Query.getFields();
    console.log(queryFields);
    const subscriptionFields = Object.keys(queryFields).reduce(
      (memo, queryFieldName) => {
        const queryField = queryFields[queryFieldName];
        memo[queryFieldName] = {
          description: (queryField.description || "") + " (live)",
          type: queryField.type,
          args: {},
          resolve: queryField.resolve,
          subscribe,
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
export default SubscriptionFieldsPlugin;
