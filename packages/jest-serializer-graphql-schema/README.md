# jest-serializer-graphql-schema

A serializer for doing [snapshot testing](https://jestjs.io/docs/en/snapshot-testing)
of [GraphQL schemas](https://graphql.org/learn/schema/) using the
[Jest](https://jestjs.io/) testing framework.

This serializer only works on instances of the `GraphQLSchema` class
exported from [`graphql-js`](https://github.com/graphql/graphql-js).
It does *not* work on <abbr title="abstract syntax tree">AST</abbr>
objects.

# Install

First, add this package as a devDependency:

```bash
# With npm
npm install --save-dev jest-serializer-graphql-schema

# With yarn
yarn add --dev jest-serializer-graphql-schema
```

Next, update your `package.json` file to
[let Jest know about the serializer](https://jestjs.io/docs/en/configuration#snapshotserializers-array-string):

```json
"jest": {
  "snapshotSerializers": ["jest-serializer-graphql-schema"]
}
```

# Simple Example

This test introspects the [Pokemon GraphQL API](https://graphql-pokemon.now.sh/)
to verify that the schema is consistent.

```ts
import fetch from "node-fetch";
import {
  getIntrospectionQuery,
  IntrospectionQuery,
  buildClientSchema,
} from "graphql";

const getPokemonSchema = async () => {
  const url = "https://graphql-pokemon.now.sh";
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify({ query: getIntrospectionQuery() }),
    headers: { "Content-Type": "application/json" },
  });
  const result = await (response.json() as Promise<{
    data: IntrospectionQuery;
  }>);
  return buildClientSchema(result.data);
};

test("Pokemon GraphQL API has a consistent schema", async () => {
  const schema = await getPokemonSchema();
  expect(schema).toMatchSnapshot();
});
```

This test will produce the following snapshot:

```graphql
// Jest Snapshot v1, https://goo.gl/fbAQLP

exports[`Pokemon Graph has a consistent schema 1`] = `
"""Represents a Pokémon's attack types"""
type Attack {
  """The damage of this Pokémon attack"""
  damage: Int

  """The name of this Pokémon attack"""
  name: String

  """The type of this Pokémon attack"""
  type: String
}

"""Represents a Pokémon"""
type Pokemon {
  """The attacks of this Pokémon"""
  attacks: PokemonAttack

  """The classification of this Pokémon"""
  classification: String

  """The evolution requirements of this Pokémon"""
  evolutionRequirements: PokemonEvolutionRequirement

  """The evolutions of this Pokémon"""
  evolutions: [Pokemon]
  fleeRate: Float

  """The minimum and maximum weight of this Pokémon"""
  height: PokemonDimension

  """The ID of an object"""
  id: ID!
  image: String

  """The maximum CP of this Pokémon"""
  maxCP: Int

  """The maximum HP of this Pokémon"""
  maxHP: Int

  """The name of this Pokémon"""
  name: String

  """The identifier of this Pokémon"""
  number: String

  """The type(s) of Pokémons that this Pokémon is resistant to"""
  resistant: [String]

  """The type(s) of this Pokémon"""
  types: [String]

  """The type(s) of Pokémons that this Pokémon weak to"""
  weaknesses: [String]

  """The minimum and maximum weight of this Pokémon"""
  weight: PokemonDimension
}

"""Represents a Pokémon's attack types"""
type PokemonAttack {
  """The fast attacks of this Pokémon"""
  fast: [Attack]

  """The special attacks of this Pokémon"""
  special: [Attack]
}

"""Represents a Pokémon's dimensions"""
type PokemonDimension {
  """The maximum value of this dimension"""
  maximum: String

  """The minimum value of this dimension"""
  minimum: String
}

"""Represents a Pokémon's requirement to evolve"""
type PokemonEvolutionRequirement {
  """The amount of candy to evolve"""
  amount: Int

  """The name of the candy to evolve"""
  name: String
}

"""Query any Pokémon by number or name"""
type Query {
  pokemon(id: String, name: String): Pokemon
  pokemons(first: Int!): [Pokemon]
  query: Query
}

`;
```
