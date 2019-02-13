# @graphile/subscriptions-lds

PostGraphile schema plugin to provide live updates powered by PostgreSQL
logical decoding. Used as part of PostGraphile's live queries support.

For more background, see: https://github.com/graphile/postgraphile/issues/92#issuecomment-313476989

## Setting up PostgreSQL

TL;DR: set `wal_level = logical` in `postgresql.conf` and ensure `wal2json`
is installed.

This plugin uses logical decoding and `wal2json`, so you must configure your
PostgreSQL database to support this.

### Setting wal_level = logical

In your `postgresql.conf` you need to enable `wal_level = logical`. You
should ensure that the following settings are set (the `10`s can be any
number greater than 1; set them to how many PostGraphile instances you're
expecting to run, plus a little buffer):

```
wal_level = logical
max_wal_senders = 10
max_replication_slots = 10
```

### Installing wal2json

You also need to ensure that `wal2json` is installed. This comes as standard
in many managed PostgreSQL services, such as Amazon RDS, but to install it locally:

1. Ensure that `which pg_config` returns the path to the **correct**
   `pg_config` binary - the one related to your PostgreSQL install. (For
   example, if on a Mac you've installed both Postgres.app _and_ PostgreSQL from
   homebrew then you must modify your `PATH` variable to point at whichever one
   you use, e.g. `export PATH="/Applications/Postgres.app/Contents/Versions/10/bin/:$PATH"`)
2. Run the below code (it takes about 10 seconds):

```bash
git clone https://github.com/eulerto/wal2json.git
cd wal2json
USE_PGXS=1 make
USE_PGXS=1 make install
```

3. (optional) delete the wal2json folder

## Installation:

Install alongside `postgraphile`, e.g.:

```
yarn add @graphile/subscriptions-lds
```

### Usage:

To use this plugin:

- You need to load the plugin with `--append-plugins` (or `appendPlugins`)
- You need to enable live support in PostGraphile with `--live` (or `live: true`)
- If you don't use a superuser or database owner PostgreSQL user with PostGraphile normally (or if you pass a pool to the PostGraphile library), you must provide a superuser or database owner connection string via `--owner-connection` (or `ownerConnectionString`)

CLI:

```
postgraphile \
  --live \
  --append-plugins @graphile/subscriptions-lds \
  --owner-connection postgres://db_owner:db_owner_pass@host/db \
  ...
```

Library:

```js
app.use(
  postgraphile(DB, SCHEMA, {
    //...

    // Enable live support in PostGraphile
    live: true,
    // We need elevated privileges for logical decoding
    ownerConnectionString: "postgres://db_owner:db_owner_pass@host/db",
    appendPlugins: [
      //...

      // Add this plugin
      require("@graphile/subscriptions-lds").default,
    ],
  })
);
```

## Optimising

Please note that the defaults shown below are likely to change over time
based on user feedback. This document will not necessarily be updated with
the new defaults.

### `LD_WAIT` (default 125)

This environmental variable controls how often in milliseconds we check for
changes from the database. Setting it smaller leads to more timely updates
but increases overhead. Setting it larger increases efficiency but means each
batch takes longer to process which may slow the Node.js event loop.

### `LIVE_THROTTLE` (default 500)

This environmental variable is the minimum duration in milliseconds between
live updates to the same subscription.

If your server is getting overwhelmed, you may increase this to increase the
period between live updates sent to clients.

If your application is not responsive enough, you may decrease this to get
closer to real-time updates.

(Throttle fires on both the leading and trailing edge, so decreasing this
only affects successive updates, not the initial update.)

### `LD_TABLE_PATTERN` (default "\*.\*")

Set this envvar to e.g. `app_public.*` to only monitor tables in the
`app_public` schema. See [`filter-tables` in the wal2json
documentation](https://github.com/eulerto/wal2json#parameters)

## Running LDS externally

If you reach sufficient scale that running `@graphile/lds` on its own server
makes sense (rather than using the embedded version) then you can do so
easily. Follow the steps in the `@graphile/lds` README to get the server up
and running, and then set environmental variable `LDS_SERVER_URL` to the full
websocket URL to your LDS server, e.g. `ws://127.0.0.1:9876` (default) before
loading this plugin.
