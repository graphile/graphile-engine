import type {
  Build,
  Context,
  Options,
  Plugin,
  SchemaBuilder,
} from "graphile-build";
import type { GraphQLFieldConfig, GraphQLInputFieldConfig, GraphQLType } from "graphql";

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
      type: GraphQLType,
      allNullabilities: boolean[]
    ): GraphQLType {
      const { GraphQLNonNull, GraphQLList } = build.graphql;
      const [nullability, ...rest] = allNullabilities;
      const nullableType = type instanceof GraphQLNonNull ? type.ofType : type;
      if (rest.length > 0 && !(nullableType instanceof GraphQLList)) {
        throw new Error(`There were too many booleans for the number of lists in the type`);
      }
      const inner = nullableType instanceof GraphQLList
        ? new GraphQLList(applyNullability(build, nullableType.ofType, rest))
        : nullableType;
      return nullability ? inner : new GraphQLNonNull(inner);
    }
    function applyTypeNullability(
      build: Build,
      type: GraphQLType,
      shouldBeNullable: boolean | boolean[]
    ): GraphQLType {
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
              const arg = field.args ? field.args[argName] : null;
              if (!arg) {
                console.warn(
                  `Warning: makeChangeNullabilityPlugin cannot apply rule - field ${typeName}.${fieldName} has no argument '${argName}'`
                );
                return;
              }
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
          `Error occurred whilst processing makeChangeNullabilityPlugin rule for ${typeName}.${fieldName}: ${err.message}`
        );
      }
      return field;
    }
    builder.hook("GraphQLInputObjectType:fields:field", changeNullability);
    builder.hook("GraphQLObjectType:fields:field", changeNullability);
  };
}
