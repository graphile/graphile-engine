import type { GraphQLSchema } from "graphql";
import type { SchemaBuilder } from "graphile-build";

type ProcessSchemaFunction = (schema: GraphQLSchema) => GraphQLSchema;
export default function makeProcessSchemaPlugin(
  schemaCallback: ProcessSchemaFunction
) {
  return (builder: SchemaBuilder) => {
    builder.hook("finalize", schemaCallback);
  };
}
