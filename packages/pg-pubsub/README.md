# @graphile/pg-pubsub

This PostGraphile [server
plugin](https://www.graphile.org/postgraphile/plugins/) provides a `pubsub`
instance to [schema
plugins](https://www.graphile.org/postgraphile/extending/) that uses
PostgreSQL `LISTEN`/`NOTIFY` to provide realtime features.

Also adds support for `@pgSubscriptions` directive to easily define your own
subscriptions using LISTEN/NOTIFY with `makeExtendSchemaPlugin`; and adds the
`--simple-subscriptions` feature which, when enabled, adds a simple `listen`
subscription field to your GraphQL API.

It's intended that you use this plugin as a provider of realtime data to
other plugins which can use it to add subscription fields to your API.

For full documentation, see: https://www.graphile.org/postgraphile/subscriptions/
