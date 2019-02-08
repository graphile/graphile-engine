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

## Cleaning up

It's essential that you drop the logical replication slot when you no longer
need it, otherwise your disk will fill up. To do so:

```sql
SELECT pg_drop_replication_slot('postgraphile');
```

(It's okay to keep it active whilst you're running the LDS because we'll keep
consuming the data and it'll be cleared automatically. It's only when LDS
isn't running that data will build up.)
