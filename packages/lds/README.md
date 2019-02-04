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
