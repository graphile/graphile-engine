//@flow
import { createHash } from "crypto";
import LRU from "lru-cache";
import type { PoolClient } from "pg";

const hash = (str: string) =>
  createHash("sha1")
    .update(str)
    .digest("base64");

export default function pgPrepareAndRun(
  pgClient: PoolClient,
  text: string,
  // eslint-disable-next-line flowtype/no-weak-types
  values: any
) {
  const connection = pgClient.connection;
  if (!values || !connection) {
    return pgClient.query(text, values);
  } else {
    const name = hash(text);
    connection._graphilePreparedStatementCache =
      connection._graphilePreparedStatementCache ||
      LRU({
        max: 50,
        dispose(key) {
          pgClient
            .query(`deallocate ${pgClient.escapeIdentifier(key)}`)
            .then(() => {
              delete connection.parsedStatements[key];
            })
            .catch(e => {
              // eslint-disable-next-line no-console
              console.error("Error releasing prepared query", e);
            });
        },
      });
    if (!connection._graphilePreparedStatementCache.get(name)) {
      // We're relying on dispose to clear out the old ones.
      connection._graphilePreparedStatementCache.set(name, true);
    }
    return pgClient.query({
      name,
      text,
      values,
    });
  }
}
