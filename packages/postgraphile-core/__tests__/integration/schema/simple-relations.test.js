const core = require("./core");

test(
  "prints a schema with simple relations head to tail",
  core.test("c", {
    simpleRelationsHead: "both",
    setofFunctionsContainNulls: false,
  })
);

test(
  "prints a schema with simple relations tail to head",
  core.test("c", {
    simpleRelationsTail: "both",
    setofFunctionsContainNulls: false,
  }) 
);