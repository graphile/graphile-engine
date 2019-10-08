const printSchemaOrdered = require("../../printSchemaOrdered");
const { withPgClient } = require("../../helpers");
const { createPostGraphileSchema } = require("../../..");
const { isSchema } = require("graphql");

const GraphQLSchemaSerializer = {
  test(val) {
    return isSchema(val);
  },
  serialize(schema) {
    return printSchemaOrdered(schema);
  },
};
expect.addSnapshotSerializer(GraphQLSchemaSerializer);

exports.test = (schemas, options, setup, finalCheck = () => {}) => () =>
  withPgClient(async client => {
    if (setup) {
      if (typeof setup === "function") {
        await setup(client);
      } else {
        await client.query(setup);
      }
    }
    const schema = await createPostGraphileSchema(client, schemas, options);
    expect(schema).toMatchSnapshot();
    await finalCheck(schema);
  });
