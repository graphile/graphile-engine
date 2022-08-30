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
