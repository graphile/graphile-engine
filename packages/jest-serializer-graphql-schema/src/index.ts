import {
  GraphQLSchema,
  isSchema,
  lexicographicSortSchema,
  printSchema,
} from "graphql";
import { Plugin } from "pretty-format";

const GraphQLSchemaSnapshotSerializer: Plugin = {
  test(val: any) {
    return isSchema(val);
  },
  serialize(schema: GraphQLSchema) {
    return printSchema(lexicographicSortSchema(schema));
  },
};

module.exports = GraphQLSchemaSnapshotSerializer;
