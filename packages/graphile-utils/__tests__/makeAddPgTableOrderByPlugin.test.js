import pg from "pg";
import { graphql } from "graphql";
import { createPostGraphileSchema } from "postgraphile-core";
import { makeAddPgTableOrderByPlugin, orderByAscDesc } from "..";

const clean = data => {
  if (Array.isArray(data)) {
    return data.map(clean);
  } else if (data && typeof data === "object") {
    return Object.keys(data).reduce((memo, key) => {
      const value = data[key];
      if (key === "id" && typeof value === "number") {
        memo[key] = "[id]";
      } else if (key === "nodeId" && typeof value === "string") {
        memo[key] = "[nodeId]";
      } else {
        memo[key] = clean(value);
      }
      return memo;
    }, {});
  } else {
    return data;
  }
};

let pgPool;

beforeAll(() => {
  pgPool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
  });
});

afterAll(() => {
  if (pgPool) {
    pgPool.end();
    pgPool = null;
  }
});

const makePetsPlugin = nullsSortMethod =>
  makeAddPgTableOrderByPlugin("graphile_utils", "users", build => {
    const { pgSql: sql } = build;
    const sqlIdentifier = sql.identifier(Symbol("pet"));

    const customOrderBy = orderByAscDesc(
      "PET_ID_AVERAGE", // this is a ridiculous and unrealistic column but it will serve for testing purposes
      helpers => {
        const { queryBuilder } = helpers;

        const orderByFrag = sql.fragment`(
          select avg(${sqlIdentifier}.id)
          from graphile_utils.pets as ${sqlIdentifier}
          where ${sqlIdentifier}.user_id = ${queryBuilder.getTableAlias()}.id
        )`;

        return orderByFrag;
      },
      { nulls: nullsSortMethod }
    );

    return customOrderBy;
  });

const getResultingOrderFromUserNodes = userNodes =>
  userNodes.map(node => node.name);

const checkArraysAreEqual = (array1, array2) =>
  JSON.stringify(array1) === JSON.stringify(array2);

const getSchema = async nullsSortMethod => {
  const schema = await createPostGraphileSchema(pgPool, ["graphile_utils"], {
    disableDefaultMutations: true,
    simpleCollections: "both",
    appendPlugins: [makePetsPlugin(nullsSortMethod)],
  });

  return schema;
};

/**
 * We expect the "pet id average" to be the following for each person:
 * Alice: null (she has no pets, so no average to make);
 * Bob: 1.5 ( = (1 + 2) / 2) -- he gets assigned pets first and has 2
 * Caroline: 4 ( = (3 + 4 + 5) / 3) -- she gets assigned pets second and has 3
 *
 * Note that even if the pet id's increase: the average orders should stay the same
 */
const getAscDescData = async (schema, pgClient) => {
  const { data: dataAsc, errors: errorsAsc } = await graphql(
    schema,
    `
      query {
        allUsers(orderBy: PET_ID_AVERAGE_ASC) {
          nodes {
            nodeId
            id
            name
          }
        }
      }
    `,
    null,
    { pgClient },
    {}
  );

  const { data: dataDesc, errors: errorsDesc } = await graphql(
    schema,
    `
      query {
        allUsers(orderBy: PET_ID_AVERAGE_DESC) {
          nodes {
            nodeId
            id
            name
          }
        }
      }
    `,
    null,
    { pgClient },
    {}
  );

  const userNodesAsc = dataAsc?.allUsers?.nodes;
  const userNodesDesc = dataDesc?.allUsers?.nodes;

  return {
    dataAsc,
    dataDesc,
    errorsAsc,
    errorsDesc,
    userNodesAsc,
    userNodesDesc,
  };
};

it('allows creating a "order by" plugin with DEFAULT asc/desc ordering', async () => {
  const schema = await getSchema();
  const pgClient = await pgPool.connect();

  try {
    const {
      dataAsc,
      dataDesc,
      errorsAsc,
      errorsDesc,
      userNodesAsc,
      userNodesDesc,
    } = await getAscDescData(schema, pgClient);

    // by default, the natural order by puts nulls last when using ascending order
    const correctOrderAsc = ["Bob", "Caroline", "Alice"];
    const resultingOrderAsc = getResultingOrderFromUserNodes(userNodesAsc);

    const ascOrdersAreEqual = checkArraysAreEqual(
      correctOrderAsc,
      resultingOrderAsc
    );

    expect(errorsAsc).toBeFalsy();
    expect(dataAsc).toBeTruthy();
    expect(ascOrdersAreEqual).toBeTruthy();

    // by default, the natural order by puts nulls FIRST when using descending order
    const correctOrderDesc = ["Alice", "Caroline", "Bob"];
    const resultingOrderDesc = getResultingOrderFromUserNodes(userNodesDesc);

    const descOrdersAreEqual = checkArraysAreEqual(
      correctOrderDesc,
      resultingOrderDesc
    );

    expect(errorsDesc).toBeFalsy();
    expect(dataDesc).toBeTruthy();
    expect(descOrdersAreEqual).toBeTruthy();
  } finally {
    await pgClient.release();
  }
});

it('allows creating a "order by" plugin with NULLS FIRST asc/desc ordering', async () => {
  const schema = await getSchema("first");
  const pgClient = await pgPool.connect();

  try {
    const {
      dataAsc,
      dataDesc,
      errorsAsc,
      errorsDesc,
      userNodesAsc,
      userNodesDesc,
    } = await getAscDescData(schema, pgClient);

    // nulls first, so Alice, then ascending
    const correctOrderAsc = ["Alice", "Bob", "Caroline"];
    const resultingOrderAsc = getResultingOrderFromUserNodes(userNodesAsc);

    const ascOrdersAreEqual = checkArraysAreEqual(
      correctOrderAsc,
      resultingOrderAsc
    );

    expect(errorsAsc).toBeFalsy();
    expect(dataAsc).toBeTruthy();
    expect(ascOrdersAreEqual).toBeTruthy();

    // nulls first, so Alice, then descending
    const correctOrderDesc = ["Alice", "Caroline", "Bob"];
    const resultingOrderDesc = getResultingOrderFromUserNodes(userNodesDesc);

    const descOrdersAreEqual = checkArraysAreEqual(
      correctOrderDesc,
      resultingOrderDesc
    );

    expect(errorsDesc).toBeFalsy();
    expect(dataDesc).toBeTruthy();
    expect(descOrdersAreEqual).toBeTruthy();
  } finally {
    await pgClient.release();
  }
});

it('allows creating a "order by" plugin with NULLS LAST asc/desc ordering', async () => {
  const schema = await getSchema("last");
  const pgClient = await pgPool.connect();

  try {
    const {
      dataAsc,
      dataDesc,
      errorsAsc,
      errorsDesc,
      userNodesAsc,
      userNodesDesc,
    } = await getAscDescData(schema, pgClient);

    // nulls last, so ascending, then Alice
    const correctOrderAsc = ["Bob", "Caroline", "Alice"];
    const resultingOrderAsc = getResultingOrderFromUserNodes(userNodesAsc);

    const ascOrdersAreEqual = checkArraysAreEqual(
      correctOrderAsc,
      resultingOrderAsc
    );

    expect(errorsAsc).toBeFalsy();
    expect(dataAsc).toBeTruthy();
    expect(ascOrdersAreEqual).toBeTruthy();

    // nulls last, so descending, then Alice
    const correctOrderDesc = ["Caroline", "Bob", "Alice"];
    const resultingOrderDesc = getResultingOrderFromUserNodes(userNodesDesc);

    const descOrdersAreEqual = checkArraysAreEqual(
      correctOrderDesc,
      resultingOrderDesc
    );

    expect(errorsDesc).toBeFalsy();
    expect(dataDesc).toBeTruthy();
    expect(descOrdersAreEqual).toBeTruthy();
  } finally {
    await pgClient.release();
  }
});

it('allows creating a "order by" plugin with NULLS FIRST IFF ASCENDING asc/desc ordering', async () => {
  const schema = await getSchema("first-iff-ascending");
  const pgClient = await pgPool.connect();

  try {
    const {
      dataAsc,
      dataDesc,
      errorsAsc,
      errorsDesc,
      userNodesAsc,
      userNodesDesc,
    } = await getAscDescData(schema, pgClient);

    // nulls first, so Alice, then ascending
    const correctOrderAsc = ["Alice", "Bob", "Caroline"];
    const resultingOrderAsc = getResultingOrderFromUserNodes(userNodesAsc);

    const ascOrdersAreEqual = checkArraysAreEqual(
      correctOrderAsc,
      resultingOrderAsc
    );

    expect(errorsAsc).toBeFalsy();
    expect(dataAsc).toBeTruthy();
    expect(ascOrdersAreEqual).toBeTruthy();

    // nulls last, so descending, then Alice
    const correctOrderDesc = ["Caroline", "Bob", "Alice"];
    const resultingOrderDesc = getResultingOrderFromUserNodes(userNodesDesc);

    const descOrdersAreEqual = checkArraysAreEqual(
      correctOrderDesc,
      resultingOrderDesc
    );

    expect(errorsDesc).toBeFalsy();
    expect(dataDesc).toBeTruthy();
    expect(descOrdersAreEqual).toBeTruthy();
  } finally {
    await pgClient.release();
  }
});

it('allows creating a "order by" plugin with NULLS LAST IFF ASCENDING asc/desc ordering', async () => {
  const schema = await getSchema("last-iff-ascending");
  const pgClient = await pgPool.connect();

  try {
    const {
      dataAsc,
      dataDesc,
      errorsAsc,
      errorsDesc,
      userNodesAsc,
      userNodesDesc,
    } = await getAscDescData(schema, pgClient);

    // nulls last, so ascending, then Alice
    const correctOrderAsc = ["Bob", "Caroline", "Alice"];
    const resultingOrderAsc = getResultingOrderFromUserNodes(userNodesAsc);

    const ascOrdersAreEqual = checkArraysAreEqual(
      correctOrderAsc,
      resultingOrderAsc
    );

    expect(errorsAsc).toBeFalsy();
    expect(dataAsc).toBeTruthy();
    expect(ascOrdersAreEqual).toBeTruthy();

    // nulls first, so Alice, then descending
    const correctOrderDesc = ["Alice", "Caroline", "Bob"];
    const resultingOrderDesc = getResultingOrderFromUserNodes(userNodesDesc);

    const descOrdersAreEqual = checkArraysAreEqual(
      correctOrderDesc,
      resultingOrderDesc
    );

    expect(errorsDesc).toBeFalsy();
    expect(dataDesc).toBeTruthy();
    expect(descOrdersAreEqual).toBeTruthy();
  } finally {
    await pgClient.release();
  }
});
