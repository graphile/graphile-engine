// @flow
import type { Plugin } from "../SchemaBuilder";

const MutationPayloadQueryPlugin: Plugin = function MutationPayloadQueryPlugin(
  builder
) {
  builder.hook(
    "GraphQLObjectType:fields",
    (
      fields: Object,
      { $$isQuery, extend, getTypeByName },
      { scope: { isMutationPayload } }
    ): Object => {
      if (!isMutationPayload) {
        return fields;
      }
      const Query = getTypeByName("Query");
      return extend(fields, {
        query: {
          description:
            "Our root query field type. Allows us to run any query from our mutation payload.",
          type: Query,
          resolve() {
            return $$isQuery;
          },
        },
      });
    }
  );
};
export default MutationPayloadQueryPlugin;
