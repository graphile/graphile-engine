const { isSchema, printSchema } = require("graphql");
const { buildSchema, defaultPlugins } = require("../");

const GraphQLSchemaSerializer = {
  test(val) {
    return isSchema(val);
  },
  serialize(schema) {
    return printSchema(schema);
  },
};
expect.addSnapshotSerializer(GraphQLSchemaSerializer);

test("generates empty schema (with no Mutation type)", async () => {
  const schema = await buildSchema([...defaultPlugins]);
  expect(schema).toMatchSnapshot();
});
