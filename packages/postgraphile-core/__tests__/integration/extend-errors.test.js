const { withPgClient } = require("../helpers");
const { createPostGraphileSchema } = require("../..");

function check(description, sql) {
  test(description, async () => {
    let error;
    await withPgClient(async pgClient => {
      await pgClient.query(sql);
      try {
        await createPostGraphileSchema(pgClient, ["a", "b", "c"], {
          simpleCollections: "both",
        });
      } catch (e) {
        error = e;
      }
    });
    expect(error).toBeTruthy();
    expect(error).toMatchSnapshot();
  });
}

check(
  "simple collections naming clash",
  `
    comment on constraint post_author_id_fkey on a.post is E'@foreignFieldName clash\nRest of existing ''comment'' \nhere.';
  `
);

check(
  "table naming clash - direct",
  `
    comment on table a.post is E'@name person\nRest of existing ''comment'' \nhere.';
  `
);

check(
  "table naming clash - condition",
  `
    comment on table a.post is E'@name person_condition\nRest of existing ''comment'' \nhere.';
  `
);

check(
  "table naming clash - order",
  `
    comment on table a.post is E'@name people_order_by\nRest of existing ''comment'' \nhere.';
  `
);
