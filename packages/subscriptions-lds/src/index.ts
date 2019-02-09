import { makePluginByCombiningPlugins } from "graphile-utils";
import AddQueriesToSubscriptionsPlugin from "./AddQueriesToSubscriptionsPlugin";
import PgLDSSourcePlugin from "./PgLDSSourcePlugin";

/*
 * Create subscription fields for query fields (and instant-trigger).
 * When subscription fields resolve, track the records that go out.
 * Subscribe to LDS for these records/collections.
 * When LDS announces change to relevant record/collection, re-run subscription.
 */
const SubscriptionsLdsPlugin = makePluginByCombiningPlugins(
  PgLDSSourcePlugin,
  AddQueriesToSubscriptionsPlugin
);

export default SubscriptionsLdsPlugin;
