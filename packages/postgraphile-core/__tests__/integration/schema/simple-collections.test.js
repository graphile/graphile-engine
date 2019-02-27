const core = require("./core");

test(
  "prints a schema with both simple collections and relay connections",
  core.test("c", {
    simpleCollections: "both",
    setofFunctionsContainNulls: false,
  })
);

test(
  "prints a schema with only simple collections",
  core.test("c", {
    simpleCollections: "only",
    setofFunctionsContainNulls: false,
  })
);

test(
  "schema with simple collections by default, but relay for people",
  core.test(
    "simple_collections",
    {
      simpleCollections: "only",
      setofFunctionsContainNulls: false,
    },
    pgClient =>
      pgClient.query(`
  comment on table simple_collections.people is E'@simpleCollections omit';
  `)
  )
);
