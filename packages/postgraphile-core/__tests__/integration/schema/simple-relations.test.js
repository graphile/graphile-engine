const core = require("./core");

test(
  "prints a schema with simple relations",
  core.test("c", {
    simpleRelations: "both",
    setofFunctionsContainNulls: false,
  })
);
