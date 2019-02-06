import { Plugin } from "postgraphile-core";
import { GraphQLObjectType } from "graphql";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class Monitor {
  reset() {
    // clear monitoring
  }
  release() {
    this.reset();
  }
  live() {
    console.log("Live...");
  }
}

async function* ai(monitor) {
  try {
    let counter = 0;
    while (true) {
      monitor.reset();
      yield counter++;
      console.log("Tick " + counter);
      await sleep(1000);
    }
  } finally {
    monitor.release();
    console.log("ENDED SUBSCRIPTION");
  }
}

function subscribe(_parent, _args, context, _info) {
  const monitor = new Monitor();
  context.live = monitor.live.bind(monitor);
  return ai(monitor);
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
