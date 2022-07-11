const core = require("./core");

test(
  "prints a schema to test partitioned table-specific features ignoring partition parents and using partitions",
  core.test(["partitioned"], {
    graphileBuildOptions: {
      pgUsePartitionParents: false,
    },
  })
);
test(
  "prints a schema to test partitioned table-specific features using partition parents and ignoring partitions",
  core.test(["partitioned"], {
    graphileBuildOptions: {
      pgUsePartitionParents: true,
    },
  })
);
