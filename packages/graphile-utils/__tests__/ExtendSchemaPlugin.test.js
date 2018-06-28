import { ExtendSchemaPlugin, gql } from "../src";
import {
  buildSchema,
  defaultPlugins,
  StandardTypesPlugin,
  QueryPlugin,
  MutationPlugin,
  MutationPayloadQueryPlugin,
} from "graphile-build";
import { graphql, printSchema } from "graphql";

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
      resolvers: {
        Query: {
          randomNumber(_query, _args, _context, _info) {
            return 4; // chosen by fair dice roll. guaranteed to be random. xkcd#221
          },
        },
      },
    })),
  ]);
  const printedSchema = printSchema(schema);
  expect(printedSchema).toMatchSnapshot();
  const { data } = await graphql(
    schema,
    `
      {
        randomNumber
      }
    `
  );
  expect(data.randomNumber).toEqual(4);
});
