export default function sqlField(
  build,
  fieldWithHooks,
  fieldName,
  fieldSpec,
  fieldScope = {},
  whereFrom = false,
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
        const resolveData = getDataFromParsedResolveInfoFragment(
          parsedResolveInfoFragment,
          FieldType
        );
        return {
          ...(options.hoistCursor &&
          resolveData.usesCursor &&
          resolveData.usesCursor.length
            ? { usesCursor: [true] }
            : null),
          pgQuery: queryBuilder => {
            queryBuilder.select(() => {
              const tableAlias =
                whereFrom === false
                  ? queryBuilder.getTableAlias()
                  : sql.identifier(Symbol());
              const query = queryFromResolveData(
                whereFrom ? whereFrom(queryBuilder) : sql.identifier(Symbol()),
                tableAlias,
                resolveData,
                whereFrom === false
                  ? { onlyJsonField: true }
                  : { asJson: true },
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
