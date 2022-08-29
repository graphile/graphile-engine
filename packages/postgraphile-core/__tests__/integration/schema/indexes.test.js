const core = require("./core");

test(
  "prints a schema respecting indexes for conditions and order by",
  core.test(__filename, ["a", "b", "c"], {
    ignoreIndexes: false,
  })
);

test(
  "prints a schema for index_expressions",
  core.test(__filename, ["index_expressions"], {
    disableDefaultMutations: true,
  })
);

const IndexTypeCheckerPlugin = builder => {
  builder.hook("build", build => {
    const { pgIntrospectionResultsByKind } = build;
    if (
      !pgIntrospectionResultsByKind.index.every(idx => idx.indexType != null)
    ) {
      throw new Error("indexType missing");
    }
    return build;
  });
};

test(
  "index types are present on introspection",
  core.test(__filename, ["index_expressions"], {
    appendPlugins: [IndexTypeCheckerPlugin],
  })
);
