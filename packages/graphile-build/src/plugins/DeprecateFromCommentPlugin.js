// @flow
import type SchemaBuilder, { Plugin } from "../SchemaBuilder";
import { parseTags } from "../utils";

export default (function DeprecateFromCommentPlugin(builder: SchemaBuilder) {
  builder.hook("GraphQLObjectType:fields:field", (field: {}) => {
    if (typeof field.description !== "string") return field;
    const parsed = parseTags(field.description);
    return parsed.tags.deprecated
      ? Object.assign({}, field, {
          description: parsed.text,
          deprecationReason: parsed.tags.deprecated,
        })
      : field;
  });
}: Plugin);
