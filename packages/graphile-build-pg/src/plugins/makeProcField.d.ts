import { PgType, PgProc } from "./PgIntrospectionPlugin";
import { GraphQLInputType } from "graphql";
import { Build } from "graphile-build";
import { SQL } from "../QueryBuilder";

export function procFieldDetails(
  proc: PgProc,
  build: Build,
  options: {
    computed?: boolean;
    isMutation?: boolean;
  }
): {
  inputs: {
    [name: string]: {
      type: GraphQLInputType;
      description?: string;
    };
  };
  makeSqlFunctionCall: (
    args: any,
    options: { implicitArgs?: any[]; unnest?: boolean }
  ) => SQL;
  outputArgNames: string[];
  outputArgTypes: PgType[];
};
