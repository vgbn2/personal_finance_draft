'use strict';

const SCHEMA_VERSION = 3;

const FAMILIES = Object.freeze([
  'equity',
  'cryptoasset',
  'fx_pair',
  'commodity',
  'index',
]);

const SUBTYPES = Object.freeze([
  'common_stock',
  'native_chain',
  'protocol_token',
  'exchange_or_meme_token',
  'fx_pair',
  'energy',
  'metals',
  'agriculture',
  'index',
]);

const DOMAINS = Object.freeze([
  'technical',
  'fundamental',
  'macro',
  'onchain',
  'market_structure',
  'breadth',
  'supply_demand',
  'positioning',
  'sentiment',
  'catalyst',
  'data_quality',
]);

const DIRECTIONS = Object.freeze(['long', 'short', 'neutral']);
const DECISION_STATES = Object.freeze(['eligible', 'degraded', 'excluded']);
const QUALITIES = Object.freeze(['verified', 'estimated', 'degraded', 'unknown']);
const HORIZONS = Object.freeze(['3m', 'intraday', '1d', '1w', '1m', '1y']);

module.exports = {
  SCHEMA_VERSION,
  FAMILIES,
  SUBTYPES,
  DOMAINS,
  DIRECTIONS,
  DECISION_STATES,
  QUALITIES,
  HORIZONS,
};
