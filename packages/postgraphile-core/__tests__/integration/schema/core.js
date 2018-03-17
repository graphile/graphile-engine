const printSchemaOrdered = require("../../printSchemaOrdered");
const { withPgClient } = require("../../helpers");
const { createPostGraphileSchema } = require("../../..");

exports.test = (schemas, options) => () =>
  withPgClient(async client => {
    const schema = await createPostGraphileSchema(client, schemas, options);
    expect(printSchemaOrdered(schema)).toMatchSnapshot();
  });
