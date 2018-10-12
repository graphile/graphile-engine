export default function sqlField(
  build,
  fieldWithHooks,
  fieldName,
  fieldSpec,
  fieldScope = {},
  whereFrom = sqlBuilder => sqlBuilder.getTableAlias(),
  options = {}
) {
  const { type: FieldType } = fieldSpec;
  const {
    pgSql: sql,
    pgQueryFromResolveData: queryFromResolveData,
    getSafeAliasFromAlias,
    getSafeAliasFromResolveInfo,
  } = build;
  return fieldWithHooks(
    fieldName,
    ({ getDataFromParsedResolveInfoFragment, addDataGenerator }) => {
      addDataGenerator(parsedResolveInfoFragment => {
        const safeAlias = getSafeAliasFromAlias(
          parsedResolveInfoFragment.alias
        );
        return {
          pgQuery: queryBuilder => {
            queryBuilder.select(() => {
              const resolveData = getDataFromParsedResolveInfoFragment(
                parsedResolveInfoFragment,
                FieldType
              );
              const tableAlias = sql.identifier(Symbol());
              const query = queryFromResolveData(
                whereFrom(queryBuilder),
                tableAlias,
                resolveData,
                { asJson: true },
                innerQueryBuilder => {
                  innerQueryBuilder.parentQueryBuilder = queryBuilder;
                  if (typeof options.withQueryBuilder === "function") {
                    options.withQueryBuilder(innerQueryBuilder, {
                      parsedResolveInfoFragment,
                    });
                  }
                }
              );
              return sql.fragment`(${query})`;
            }, safeAlias);
          },
        };
      });

      return {
        resolve(data, _args, _context, resolveInfo) {
          const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
          return data.data[safeAlias];
        },
        ...fieldSpec,
      };
    },
    fieldScope
  );
}
