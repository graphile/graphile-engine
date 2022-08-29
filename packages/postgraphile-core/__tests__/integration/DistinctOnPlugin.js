module.exports = builder => {
  builder.hook(
    "GraphQLObjectType:fields:field:args",
    (args, build, context) => {
      const {
        graphql: { GraphQLString },
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
            if (!distinct) {
              return;
            }
            const id = sql.fragment`${queryBuilder.getTableAlias()}.${sql.identifier(
              distinct
            )}`;

            queryBuilder.distinctOn(id);
          },
        };
      });

      return build.extend(
        args,
        {
          distinct: {
            type: GraphQLString,
          },
        },
        "test"
      );
    }
  );
};
