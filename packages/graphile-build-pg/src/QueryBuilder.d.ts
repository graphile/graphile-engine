import * as sql from "pg-sql2";
import { SQL } from "pg-sql2";
export { sql, SQL };

export interface GenContext {
  queryBuilder: QueryBuilder;
}
export type Gen<T> = (context: GenContext) => T;

export type RawAlias = Symbol | string;
export type SQLAlias = SQL;
export type SQLGen = Gen<SQL> | SQL;
export type NumberGen = Gen<number> | number;
export type CursorValue = {};
export type CursorComparator = (val: CursorValue, isAfter: boolean) => void;

export default class QueryBuilder {
  beforeLock(field: string, fn: () => void): void;
  setCursorComparator(fn: CursorComparator): void;
  addCursorCondition(cursorValue: CursorValue, isAfter: boolean): void;
  select(exprGen: SQLGen, alias: RawAlias): void;
  selectCursor(exprGen: SQLGen): void;
  from(expr: SQLGen, alias?: SQLAlias): void;
  where(exprGen: SQLGen): void;
  whereBound(exprGen: SQLGen, isLower: boolean): void;
  setOrderIsUnique(): void;
  orderBy(exprGen: SQLGen, ascending: boolean): void;
  limit(limitGen: NumberGen): void;
  offset(offsetGen: NumberGen): void;
  first(first: number): void;
  last(last: number): void;

  // ----------------------------------------

  isOrderUnique(lock?: boolean): boolean;
  getTableExpression(): SQL;
  getTableAlias(): SQL;
  getSelectCursor(): SQL;
  getOffset(): number;
  getFinalLimitAndOffset(): {
    limit: number;
    offset: number;
    flip: boolean;
  };
  getFinalOffset(): number;
  getFinalLimit(): number;
  getOrderByExpressionsAndDirections(): Array<[SQL, boolean]>;
  getSelectFieldsCount(): number;
  buildSelectFields(): SQL;
  buildSelectJson({ addNullCase }: { addNullCase?: boolean }): SQL;
  buildWhereBoundClause(isLower: boolean): SQL;
  buildWhereClause(
    includeLowerBound: boolean,
    includeUpperBound: boolean,
    { addNullCase }: { addNullCase?: boolean }
  ): SQL;
  build(options?: {
    asJson?: boolean;
    asJsonAggregate?: boolean;
    onlyJsonField?: boolean;
    addNullCase?: boolean;
  }): SQL;

  // ----------------------------------------

  lock(type: string): void;
  checkLock(type: string): void;
  lockEverything(): void;
}
