const core = require("./core");
const fs = require("fs");

test(
  "prints a schema with the default options using RBAC permissions",
  core.test(["a", "b", "c"], {}, client =>
    client.query("set role postgraphile_test_visitor")
  )
);
