import { Plugin } from "postgraphile-core";
import { GraphQLObjectType } from "graphql";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class Monitor {
  public reset() {
    // clear monitoring
  }
  public release() {
    this.reset();
  }
  public live(schema: string, table: string, identifiers: any[]) {
    console.log("Live...", schema, table, identifiers);
  }
}

async function* ai(monitor: Monitor) {
  try {
    let counter = 0;
    while (true) {
      monitor.reset();
      yield counter++;
      if (counter > 5) {
        throw new Error("Counter too high!");
      }
      console.log("Tick " + counter);
      await sleep(1000);
    }
  } finally {
    monitor.release();
    console.log("ENDED SUBSCRIPTION");
  }
}

function subscribe(_parent: any, _args: any, context: any, _info: any) {
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
