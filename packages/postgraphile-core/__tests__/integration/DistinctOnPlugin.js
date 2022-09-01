module.exports = builder => {
  builder.hook(
    "GraphQLObjectType:fields:field:args",
    (args, build, context) => {
      const {
        graphql: { GraphQLString, GraphQLList },
        pgSql: sql,
      } = build;

      const {
        Self,
        scope: { fieldName },
        addArgDataGenerator,
      } = context;

      if (!(Self.name === "Query" && fieldName === "allToys")) {
        return args;
      }

      addArgDataGenerator(({ distinct }) => {
        return {
          pgQuery: queryBuilder => {
            distinct?.map(field => {
              // THIS IS AN EXAMPLE FOR THE TESTS. DO NOT USE THIS IN REAL PRODUCTION CODE!
              // Instead you should use an enum to indicate the allowed identifiers; otherwise
              // you risk interacting with the system columns and maybe worse.
              const id = sql.fragment`${queryBuilder.getTableAlias()}.${sql.identifier(
                field
              )}`;

              queryBuilder.distinctOn(id);
            });
          },
        };
      });

      return build.extend(
        args,
        {
          distinct: {
            type: new GraphQLList(GraphQLString),
          },
        },
        "test"
      );
    }
  );
};
