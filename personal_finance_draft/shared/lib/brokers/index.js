const { spec: alpaca, buildAlpacaReport, resolveAlpacaSettings } = require('./alpaca_env');
const { spec: gateio, buildGateIoReport, resolveGateIoSettings } = require('./gateio_env');
const { spec: mt5, buildMt5Report, resolveMt5Settings } = require('./mt5_env');
const { spec: polymarket, buildPolymarketReport } = require('./polymarket_env');
const { spec: supabase, buildSupabaseReport } = require('../auth/supabase_env');

const REGISTRY = {
  alpaca,
  gateio,
  mt5,
  polymarket,
  supabase,
};

const BUILDERS = {
  alpaca: buildAlpacaReport,
  gateio: buildGateIoReport,
  mt5: buildMt5Report,
  polymarket: buildPolymarketReport,
  supabase: buildSupabaseReport,
};

function listBrokers() {
  return Object.keys(REGISTRY);
}

function getBrokerSpec(name) {
  return REGISTRY[String(name || '').toLowerCase()] || null;
}

function buildBrokerReport(name, env = process.env, options = {}) {
  const spec = getBrokerSpec(name);
  if (!spec) return null;
  return BUILDERS[spec.broker](env, options);
}

module.exports = {
  REGISTRY,
  BUILDERS,
  listBrokers,
  getBrokerSpec,
  buildBrokerReport,
  resolveAlpacaSettings,
  resolveGateIoSettings,
  resolveMt5Settings,
};
