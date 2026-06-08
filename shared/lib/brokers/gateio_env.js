const { buildBrokerReport, getEnvValue } = require('./common');

const spec = {
  broker: 'gateio',
  displayName: 'Gate.io',
  defaultHost: 'https://api.gateio.ws/api/v4',
  hostKeys: ['GATEIO_BASE_URL'],
  fields: [
    { key: 'GATEIO_API_KEY', label: 'API Key', required: true, secret: true },
    { key: 'GATEIO_API_SECRET', label: 'API Secret', required: true, secret: true },
    { key: 'GATEIO_API_PASSPHRASE', label: 'API Passphrase', required: true, secret: true },
    { key: 'GATEIO_BASE_URL', label: 'Base URL', required: false, secret: false },
  ],
  notes: ['Gate.io live execution must stay on a user-owned machine or private runner.'],
  setupDefaults() {
    return { GATEIO_BASE_URL: 'https://api.gateio.ws/api/v4' };
  },
};

function buildGateIoReport(env = process.env, options = {}) {
  return buildBrokerReport(spec, env, options);
}

function resolveGateIoSettings(env = process.env, options = {}) {
  return {
    baseUrl: options.baseUrl
      || getEnvValue(env, ['GATEIO_BASE_URL'])
      || spec.defaultHost,
    apiKey: options.apiKey
      || getEnvValue(env, ['GATEIO_API_KEY']),
    apiSecret: options.apiSecret
      || getEnvValue(env, ['GATEIO_API_SECRET']),
  };
}

module.exports = { spec, buildGateIoReport, resolveGateIoSettings };
