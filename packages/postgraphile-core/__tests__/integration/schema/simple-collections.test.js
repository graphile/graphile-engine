const core = require("./core");

test(
  "prints a schema with both simple collections and relay connections",
  core.test(__filename, "c", {
    simpleCollections: "both",
    setofFunctionsContainNulls: false,
  })
);

test(
  "prints a schema with only simple collections",
  core.test(__filename, "c", {
    simpleCollections: "only",
    setofFunctionsContainNulls: false,
  })
);

test(
  "schema with simple collections by default, but relay for people",
  core.test(
    __filename,
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

test(
  "simple collection for computed column",
  core.test(
    __filename,
    "simple_collections",
    {
      simpleCollections: "omit",
      setofFunctionsContainNulls: false,
    },
    pgClient =>
      pgClient.query(`
        comment on function simple_collections.people_odd_pets(simple_collections.people) is E'@simpleCollections only';
      `)
  )
);

test(
  "simple collection for relation",
  core.test(
    __filename,
    "simple_collections",
    {
      simpleCollections: "omit",
      setofFunctionsContainNulls: false,
    },
    pgClient =>
      pgClient.query(`
        comment on constraint pets_owner_id_fkey on simple_collections.pets is E'@simpleCollections only';
      `)
  )
);
