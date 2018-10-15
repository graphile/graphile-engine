import { ResolveTree } from "graphql-parse-resolve-info";
import { Build, Scope } from "graphile-build";
import { SQL } from 'pg-sql2';
import QueryBuilder from "../QueryBuilder";

type FieldContext<T> = any;
type FieldWithHooksFunction = any;

interface PgFieldOptions<T> {
  hoistCursor?: boolean;
  withFieldContext?: <T>(context: FieldContext<T>) => void;
  withQueryBuilder?: (
    queryBuilder: QueryBuilder,
    args: { parsedResolveInfoFragment: ResolveTree }
  ) => void;
}

export default function pgField<T>(
  build: Build,
  fieldWithHooks: FieldWithHooksFunction,
  fieldName: string,
  fieldSpec: T,
  fieldScope: Scope<T>,
    whereFrom?: false | ((queryBuilder: QueryBuilder) => SQL),
  options?: PgFieldOptions<T>
): T;
