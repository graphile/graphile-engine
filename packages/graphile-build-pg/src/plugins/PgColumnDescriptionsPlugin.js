// @flow
import type { Plugin } from "graphile-build";
import { parseTags } from "../utils";

export default (function PgColumnDescriptionsPlugin(builder) {
  builder.hook("GraphQLObjectType:fields:field", (field, build, context) => {
    const {
      scope: {
        isPgRowType,
        isPgCompoundType,
        pgIntrospection: table,
        pgFieldIntrospection,
      },
    } = context;
    if (
      !(isPgRowType || isPgCompoundType) ||
      !table ||
      table.kind !== "class" ||
      !pgFieldIntrospection ||
      typeof pgFieldIntrospection.description !== "string"
    ) {
      return field;
    }
    const parsed = parseTags(pgFieldIntrospection.description);
    return parsed.tags.deprecated
      ? Object.assign({}, field, {
          description: parsed.text,
          deprecationReason: parsed.tags.deprecated,
        })
      : Object.assign({}, field, {
          description: parsed.text,
        });
  });
}: Plugin);
