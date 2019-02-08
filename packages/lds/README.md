# @graphile/lds

Logical decoding server for PostGraphile.

Connects to a database and streams logical decoding events to interested parties.

## Requirements

You need `wal2json`; this is available on:

- Amazon RDS
- (please send a PR adding more compatible providers)

On your Unix-based OS (assuming `pg_config` is in your path) you can add it in a few seconds with:

```bash
git clone https://github.com/eulerto/wal2json.git
cd wal2json
USE_PGXS=1 make
USE_PGXS=1 make install
```

(No need to restart PostgreSQL?)

## PostgreSQL configuration

In your `postgresql.conf` you need to ensure that the following settings are set:

```
wal_level = logical
max_wal_senders = 10
max_replication_slots = 10
```

(You can set max_wal_senders and max_replication_slots to a number at least 1.)

## Environmental variables

I've not put any argument parsing into this yet, so everything's done with envvars:

Required:

- `LD_DATABASE_URL` - the database URL to connect to for logical decoding; must have permission to create the logical replication slot

Optional:

- `LD_TABLE_PATTERN` - optional setting, allows us to ignore changes in tables you don't care about; default: '_._', recommended: 'app_public.\*' (assuming your PostGraphile schema is called 'app_public').
- `LD_PORT` / `PORT` - the port number to run this server on, defaults to `9876`
- `LD_HOST` - the host name to listen on, defaults to `127.0.0.1` (set to `0.0.0.0` to listen on all interfaces, e.g. if running inside of Docker)

Very optional:

- `LD_SLOT_NAME` - optional name of the logical decoding slot to use, we use `postgraphile` by default. Be sure to drop the old slot (see below) if you change this.
- `LD_MAX_CLIENTS` - set to the maximum number of clients to allow to connect to the server. Defaults to `50`. (Each PostGraphile instance counts as one client.)
- `LD_WAIT` - duration in milliseconds to pause between logical decoding polls; defaults to `200`, reduce for lower latency but higher CPU usage.

## Cleaning up

It's essential that you drop the logical replication slot when you no longer
need it, otherwise your disk will fill up. To do so:

```sql
SELECT pg_drop_replication_slot('postgraphile'); -- or whatever slot name you were using.
```

(It's okay to keep it active whilst you're running the LDS because we'll keep
consuming the data and it'll be cleared automatically. It's only when LDS
isn't running that data will build up.)
