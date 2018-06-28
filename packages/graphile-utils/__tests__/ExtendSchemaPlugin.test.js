import { ExtendSchemaPlugin, gql } from "../src";
import {
  buildSchema,
  defaultPlugins,
  StandardTypesPlugin,
  QueryPlugin,
  MutationPlugin,
  MutationPayloadQueryPlugin,
} from "graphile-build";
import { printSchema } from "graphql";

const simplePlugins = [
  StandardTypesPlugin,
  QueryPlugin,
  MutationPlugin,
  MutationPayloadQueryPlugin,
];

it("allows adding a simple type", async () => {
  const schema = await buildSchema([
    ...simplePlugins,
    ExtendSchemaPlugin(build => ({
      typeDefs: gql`
        extend type Query {
          """
          comment
          """
          randomNumber: Int
        }
      `,
    })),
  ]);
  const printedSchema = printSchema(schema);

  console.log(printedSchema);
});
