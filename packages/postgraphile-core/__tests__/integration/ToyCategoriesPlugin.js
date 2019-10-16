module.exports = builder => {
  // This hook adds the 'Toy.categories' field
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      getTypeByName,
      graphql: { GraphQLList },
    } = build;
    const { Self, fieldWithHooks } = context;

    if (Self.name !== "Toy") {
      return fields;
    }

    return build.extend(fields, {
      categories: fieldWithHooks(
        "categories",
        ({ addDataGenerator, getDataFromParsedResolveInfoFragment }) => {
          addDataGenerator(parsedResolveInfoFragment => {
            return {
              pgQuery: queryBuilder => {
                queryBuilder.select(() => {
                  const resolveData = getDataFromParsedResolveInfoFragment(
                    parsedResolveInfoFragment,
                    gqlForeignTableType
                  );
                  const foreignTableAlias = sql.identifier(Symbol());
                  const query = queryFromResolveData(
                    sql.fragment`named_query_builder.categories`,
                    foreignTableAlias,
                    resolveData,
                    {
                      useAsterisk: false,
                      asJson: true,
                    },
                    innerQueryBuilder => {
                      innerQueryBuilder.parentQueryBuilder = queryBuilder;

                      const innerInnerQueryBuilder = innerQueryBuilder.buildNamedChildFrom(
                        "toyCategoriesSubquery",
                        sql.fragment`named_query_builder.toy_categories`,
                        "category_id"
                      );
                      innerQueryBuilder.where(
                        () =>
                          sql.fragment`${innerQueryBuilder.getTableAlias()}.id IN (${innerInnerQueryBuilder.build()})`
                      );
                    },
                    queryBuilder.context,
                    queryBuilder.rootValue
                  );
                  return sql.fragment`(${query})`;
                }, getSafeAliasFromAlias(parsedResolveInfoFragment.alias));
              },
            };
          });
          const Category = getTypeByName("Category");
          return {
            type: new GraphQLList(Category),
            resolve: (data, _args, resolveContext, resolveInfo) => {
              if (!data) return null;
              const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
              return data[safeAlias];
            },
          };
        },
        {
          /* w/e */
        }
      ),
    });
  });

  // NOTE: this could be in a completely different plugin
  // This hook adds the `approved: Boolean` argument to Toy.categories
  builder.hook(
    "GraphQLObjectType:fields:field:args",
    (args, build, context) => {
      const {
        graphql: { GraphQLBoolean },
      } = build;
      const {
        Self,
        scope: { fieldName },
        addArgDataGenerator,
      } = context;
      if (Self.name !== "Toy" || fieldName !== "categories") {
        return args;
      }

      addArgDataGenerator(({ approved }) => {
        return {
          pgQuery: queryBuilder => {
            if (approved != null) {
              const toyCategoriesQueryBuilder = queryBuilder.getNamedChild(
                "toyCategoriesSubquery"
              );
              toyCategoriesQueryBuilder.where(
                sql.fragment`${toyCategoriesQueryBuilder.getTableAlias()}.approved = ${sql.value(
                  approved
                )}`
              );
            }
          },
        };
      });

      return build.extend(
        args,
        {
          approved: {
            type: GraphQLBoolean,
          },
        },
        "Test"
      );
    }
  );
};
