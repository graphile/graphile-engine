import graphqlTag from "graphql-tag";

const $$embed = Symbol("graphile-embed");

export function isEmbed(obj) {
  return obj && obj[$$embed] === true;
}

export function embed(value) {
  return {
    [$$embed]: true,
    value,
  };
}

export function gql(strings, ...placeholders) {
  const gqlStrings = [];
  const gqlValues = [];
  let currentString = "";
  for (let idx = 0, length = strings.length; idx < length; idx++) {
    currentString += strings[idx];
    if (idx === length - 1) {
      gqlStrings.push(currentString);
    } else {
      if (isEmbed(placeholders[idx])) {
        gqlValues.push(placeholders[idx].value);
        gqlStrings.push(currentString);
        currentString = "";
      } else {
        if (typeof placeholders[idx] !== "string") {
          throw new Error(
            `Placeholder ${idx +
              1} is invalid - expected string, but received '${typeof placeholders[
              idx
            ]}'. Happened after '${currentString}'`
          );
        }
        currentString += String(placeholders[idx]);
      }
    }
  }
  return graphqlTag(gqlStrings, ...gqlValues);
}

export function AddInflectorsPlugin(additionalInflectors) {
  return builder => {
    builder.hook("inflection", (inflection, build) => {
      return build.extend(inflection, additionalInflectors);
    });
  };
}

export function ExtendSchemaPlugin(generator) {
  function getName(name) {
    if (name && name.kind === "Name" && name.value) {
      return name.value;
    }
    throw new Error("Could not extract name from AST");
  }

  function getDescription(desc) {
    if (!desc) {
      return null;
    } else if (desc.kind === "StringValue") {
      return desc.value;
    } else {
      throw new Error(
        `AST issue, we weren't expecting a description of kind '${
          desc.kind
        }' - PRs welcome!`
      );
    }
  }

  function getType(type, build) {
    if (type.kind === "NamedType") {
      return build.getTypeByName(getName(type.name));
    } else if (type.kind === "NonNullType") {
      return new build.graphql.GraphQLNonNull(getType(type.type, build));
    } else if (type.kind === "ListType") {
      return new build.graphql.GraphQLList(getType(type.type, build));
    } else {
      throw new Error(
        `We don't support AST type definition of kind '${
          type.kind
        }' yet... PRs welcome!`
      );
    }
  }

  function getInterfaces(interfaces, build) {
    if (interfaces.length) {
      throw new Error(
        `We don't support interfaces via ExtendSchemaPlugin yet; PRs welcome!`
      );
    }
    return [];
  }

  function getValue(value) {
    if (value.kind === "BooleanValue") {
      return !!value.value;
    } else if (value.kind === "StringValue") {
      return value.value;
    } else if (value.kind === "IntValue") {
      return parseInt(value.value, 10);
    } else if (value.kind === "FloatValue") {
      return parseFloat(value.value);
    } else if (value.kind === "NullValue") {
      return null;
    } else {
      throw new Error(
        `Value kind '${value.kind}' not supported yet. PRs welcome!`
      );
    }
  }

  function getDirectives(directives) {
    return (directives || []).reduce((memo, directive) => {
      if (directive.kind === "Directive") {
        const name = getName(directive.name);
        const value = directive.arguments.reduce((memo, arg) => {
          if (arg.kind === "Argument") {
            const argName = getName(arg.name);
            const argValue = getValue(arg.value);
            if (memo[name]) {
              throw new Error(
                `Argument '${argName}' of directive '${name}' must only be used once.`
              );
            }
            memo[argName] = argValue;
          } else {
            throw new Error(
              `Unexpected '${arg.kind}', we were expecting 'Argument'`
            );
          }
          return memo;
        }, {});
        if (memo[name]) {
          throw new Error(
            `Directive '${name}' must only be used once per field.`
          );
        }
        memo[name] = value;
      } else {
        throw new Error(
          `Unexpected '${directive.kind}', we were expecting 'Directive'`
        );
      }
      return memo;
    }, {});
  }

  function getArguments(args, build) {
    if (args && args.length) {
      return args.reduce((memo, arg) => {
        if (arg.kind === "InputValueDefinition") {
          const name = getName(arg.name);
          const type = getType(arg.type, build);
          const description = getDescription(arg.description);
          if (arg.defaultValue) {
            throw new Error(
              `We don't support default values on args yet, PRs welcome!`
            );
          }
          memo[name] = {
            type,
            description,
          };
        } else {
          throw new Error(
            `Unexpected '${
              arg.kind
            }', we were expecting an 'InputValueDefinition'`
          );
        }
        return memo;
      }, {});
    }
    return {};
  }

  return builder => {
    // Add stuff to the schema
    builder.hook("build", build => {
      const { typeDefs, resolvers = {} } = generator(build);
      if (!typeDefs || !typeDefs.kind === "Document") {
        throw new Error(
          "The first argument to ExtendSchemaPlugin must be generated by the `gql` helper"
        );
      }
      const objectExtensions = {};
      typeDefs.definitions.forEach(definition => {
        if (definition.kind === "ObjectTypeExtension") {
          const name = getName(definition.name);
          if (!objectExtensions[name]) {
            objectExtensions[name] = [];
          }
          objectExtensions[name].push(definition);
        } else {
          throw new Error(
            `Unexpected '${
              definition.kind
            }' definition; we were expecting 'ObjectTypeExtension', i.e. something like 'extend type Foo { ... }'`
          );
        }
      });
      return build.extend(build, {
        ExtendSchemaPlugin_objectExtensions: objectExtensions,
        ExtendSchemaPlugin_resolvers: resolvers,
      });
    });
    //const interfaces = getInterfaces(extension.interfaces, build);

    builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
      const {
        extend,
        ExtendSchemaPlugin_objectExtensions: objectExtensions,
        ExtendSchemaPlugin_resolvers: resolvers,
      } = build;
      const { Self, fieldWithHooks } = context;
      if (objectExtensions[Self.name]) {
        const newFields = objectExtensions[Self.name].reduce(
          (memo, extension) => {
            const fields = extension.fields;
            if (fields && fields.length) {
              fields.forEach(field => {
                if (field.kind === "FieldDefinition") {
                  const description = getDescription(field.description);
                  const fieldName = getName(field.name);
                  const args = getArguments(field.arguments, build);
                  const type = getType(field.type, build);
                  const directives = getDirectives(field.directives);
                  const scope = directives.scope || {};
                  const deprecationReason =
                    directives.deprecated && directives.deprecated.reason;
                  const resolve =
                    (resolvers[Self.name] && resolvers[Self.name][fieldName]) ||
                    null;
                  memo[fieldName] = fieldWithHooks(
                    fieldName,
                    {
                      type,
                      args,
                      resolve,
                      deprecationReason,
                      description,
                    },
                    scope
                  );
                } else {
                  throw new Error(
                    `AST issue: expected 'FieldDefinition', instead received '${
                      field.kind
                    }'`
                  );
                }
              });
            }
            return memo;
          },
          {}
        );
        // EXTEND!
        return extend(fields, newFields);
      } else {
        return fields;
      }
    });
  };
}
