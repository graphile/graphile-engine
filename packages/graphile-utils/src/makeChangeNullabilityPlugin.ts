import { SchemaBuilder, Build, Context, Plugin, Options } from "graphile-build";
import { GraphQLInputFieldConfig, GraphQLFieldConfig } from "graphql";

interface ChangeNullabilityRules {
  [typeName: string]: {
    [fieldName: string]: boolean | { namedType?: boolean; listType?: boolean };
  };
}

export default function makeChangeNullabilityPlugin(
  rules: ChangeNullabilityRules
): Plugin {
  return (builder: SchemaBuilder, _options: Options) => {
    function changeNullability(
      field: GraphQLInputFieldConfig,
      build: Build,
      context: Context<GraphQLInputFieldConfig>
    ): typeof field;
    function changeNullability<TSource, TContext>(
      field: GraphQLFieldConfig<TSource, TContext>,
      build: Build,
      context: Context<GraphQLFieldConfig<TSource, TContext>>
    ): typeof field;
    function changeNullability<TSource, TContext>(
      field: GraphQLInputFieldConfig | GraphQLFieldConfig<TSource, TContext>,
      build: Build,
      context: Context<
        GraphQLInputFieldConfig | GraphQLFieldConfig<TSource, TContext>
      >
    ): typeof field {
      const {
        Self,
        scope: { fieldName },
      } = context;
      const typeRules = rules[Self.name];
      if (!typeRules) {
        return field;
      }
      const shouldBeNullable = typeRules[fieldName];
      if (shouldBeNullable == null) {
        return field;
      }
      const {
        graphql: { getNullableType, getNamedType, GraphQLNonNull, GraphQLList },
      } = build;
      const nullableType = getNullableType(field.type);
      if (typeof shouldBeNullable !== "boolean") {
        const namedType = getNamedType(field.type);
        if (namedType === nullableType) {
          // Ignore non-list fields
          return field;
        }

        const wrappedType = new GraphQLList(
          shouldBeNullable.namedType ? namedType : new GraphQLNonNull(namedType)
        );
        return {
          ...field,
          type: shouldBeNullable.listType
            ? wrappedType
            : new GraphQLNonNull(wrappedType),
        };
      }
      return {
        ...field,
        type: shouldBeNullable
          ? nullableType
          : nullableType === field.type
          ? new GraphQLNonNull(field.type)
          : field.type, // Optimisation if it's already non-null
      };
    }
    builder.hook("GraphQLInputObjectType:fields:field", changeNullability);
    builder.hook("GraphQLObjectType:fields:field", changeNullability);
  };
}
