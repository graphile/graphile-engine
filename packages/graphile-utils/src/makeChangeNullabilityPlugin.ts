import type {
  Build,
  Context,
  Options,
  Plugin,
  SchemaBuilder,
} from "graphile-build";
import type { GraphQLFieldConfig, GraphQLInputFieldConfig } from "graphql";

export interface NullabilityOpts {
  /**
   * The nullability specifications for the return type of the field.
   */
  type?: boolean | boolean[];

  /**
   * The nullability specifications for the types of the named arguments of the field.
   */
  args?: {
    [argName: string]: boolean | boolean[];
  };
}
interface ChangeNullabilityRules {
  [typeName: string]: {
    [fieldName: string]: boolean | boolean[] | NullabilityOpts;
  };
}

export default function makeChangeNullabilityPlugin(
  rules: ChangeNullabilityRules
): Plugin {
  return (builder: SchemaBuilder, _options: Options) => {
    function applyNullability(
      build: Build,
      type: any,
      allNullabilities: boolean[]
    ): any {
      const { GraphQLNonNull, GraphQLList } = build.graphql;
      const [nullability, ...rest] = allNullabilities;
      const nullableType = type instanceof GraphQLNonNull ? type.ofType : type;
      let inner = null;
      if (nullableType instanceof GraphQLList) {
        inner = new GraphQLList(
          applyNullability(build, nullableType.ofType, rest)
        );
      } else {
        if (rest.length > 0) {
          throw new Error(`Too many booleans passed`);
        }
        inner = nullableType;
      }
      return nullability ? inner : new GraphQLNonNull(inner);
    }
    function applyTypeNullability(
      build: Build,
      type: any,
      shouldBeNullable: boolean | boolean[]
    ): any {
      const allNullabilities: boolean[] =
        Array.isArray(shouldBeNullable)
          ? shouldBeNullable
          : [shouldBeNullable];
      return allNullabilities.length > 0
        ? applyNullability(build, type, allNullabilities)
        : type;
    }
    function changeNullability<
      Field extends GraphQLInputFieldConfig | GraphQLFieldConfig<any, any>
    >(field: Field, build: Build, context: Context<Field>): typeof field {
      const {
        Self,
        scope: { fieldName },
      } = context;
      const typeName = Self.name;
      const typeRules = rules[typeName];
      if (!typeRules) {
        return field;
      }
      const shouldBeNullable = typeRules[fieldName];
      if (shouldBeNullable == null) {
        return field;
      }
      const shouldApplyNullabilities: NullabilityOpts =
        typeof shouldBeNullable === "boolean" || Array.isArray(shouldBeNullable)
          ? { type: shouldBeNullable }
          : shouldBeNullable;
      try {
        if (shouldApplyNullabilities.type) {
          field.type = applyTypeNullability(
            build,
            field.type,
            shouldApplyNullabilities.type
          );
        }
        if (shouldApplyNullabilities.args) {
          Object.entries(shouldApplyNullabilities.args).forEach(
            ([argName, argShouldBeNullable]) => {
              if (!field.args || !field.args[argName]) {
                console.warn(
                  `warning: makeChangeNullabilityPlugin. For ${typeName} > ${fieldName}: can't apply nullability rule for non-existing arg ${argName}`
                );
                return;
              }
              const arg = field.args[argName];
              arg.type = applyTypeNullability(
                build,
                arg.type,
                argShouldBeNullable
              );
            }
          );
        }
      } catch (err) {
        throw new Error(
          `makeChangeNullabilityPlugin. For ${typeName} > ${fieldName}: ${err.message}`
        );
      }
      return field;
    }
    builder.hook("GraphQLInputObjectType:fields:field", changeNullability);
    builder.hook("GraphQLObjectType:fields:field", changeNullability);
  };
}
