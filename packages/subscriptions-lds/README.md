# @graphile/subscriptions-lds

PostGraphile plugin to enable GraphQL subscriptions/live queries powered by PostgreSQL logical decoding.

For more background, see: https://github.com/graphile/postgraphile/issues/92#issuecomment-313476989

Also includes a plugin that automatically re-exports all query fields as subscriptions. This is likely to be moved into a separate package in future.

## Requirements

You need to run the Graphile LDS server: `@graphile/lds`

Then set environmental variable `LDS_SERVER_URL` to the full websocket URL to your LDS server, e.g.
`ws://127.0.0.1:9876` (default).

## Installation:

Install alongside `postgraphile`, e.g.:

```
yarn add @graphile/subscriptions-lds
```

### Usage:

CLI:

```
postgraphile --append-plugins @graphile/subscriptions-lds
```

Library:

```js
app.use(
  postgraphile(DB, SCHEMA, {
    //...
    appendPlugins: [
      //...
      require("@graphile/subscriptions-lds").default,
    ],
  })
);
```
