const { buildBrokerReport, getEnvValue } = require('./common');

const spec = {
  broker: 'alpaca',
  displayName: 'Alpaca',
  defaultHost: 'https://paper-api.alpaca.markets',
  hostKeys: ['ALPACA_BASE_URL'],
  fields: [
    { key: 'ALPACA_API_KEY', label: 'API Key', required: true, secret: true, aliases: ['ALPACA_KEY'] },
    { key: 'ALPACA_SECRET_KEY', label: 'Secret Key', required: true, secret: true, aliases: ['ALPACA_API_SECRET'] },
    { key: 'ALPACA_BASE_URL', label: 'Base URL', required: false, secret: false },
  ],
  notes: ['Cloud compute may score signals, but live Alpaca execution must stay on a local or private runner.'],
  setupDefaults() {
    return { ALPACA_BASE_URL: 'https://paper-api.alpaca.markets' };
  },
};

function buildAlpacaReport(env = process.env, options = {}) {
  return buildBrokerReport(spec, env, options);
}

function resolveAlpacaSettings(env = process.env, options = {}) {
  const baseUrl = options.baseUrl
    || getEnvValue(env, ['ALPACA_BASE_URL', 'ALPACA_URL'])
    || spec.defaultHost;
  const keyId = options.keyId
    || getEnvValue(env, ['ALPACA_API_KEY', 'ALPACA_KEY']);
  const secretKey = options.secretKey
    || getEnvValue(env, ['ALPACA_SECRET_KEY', 'ALPACA_API_SECRET']);
  const paper = options.paper ?? /paper/i.test(String(baseUrl || ''));

  return {
    baseUrl,
    keyId,
    secretKey,
    paper,
  };
}

module.exports = { spec, buildAlpacaReport, resolveAlpacaSettings };
