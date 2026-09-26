'use strict';

const { buildBrokerReport, getEnvValue } = require('./common');

const TESTNET_BASE_URL = 'https://test.deribit.com';
const LIVE_BASE_URL = 'https://www.deribit.com';

const spec = {
  broker: 'deribit',
  displayName: 'Deribit Options (Testnet/Live)',
  defaultHost: TESTNET_BASE_URL,
  hostKeys: ['DERIBIT_BASE_URL'],
  fields: [
    {
      key: 'DERIBIT_CLIENT_ID',
      label: 'Client ID / Key',
      required: true,
      secret: true,
      aliases: ['DERIBIT_API_KEY', 'DERIBIT_KEY'],
    },
    {
      key: 'DERIBIT_CLIENT_SECRET',
      label: 'Client Secret',
      required: true,
      secret: true,
      aliases: ['DERIBIT_API_SECRET', 'DERIBIT_SECRET'],
    },
    {
      key: 'DERIBIT_TESTNET',
      label: 'Testnet Mode',
      required: false,
      secret: false,
      aliases: ['DERIBIT_USE_TESTNET'],
    },
    {
      key: 'DERIBIT_BASE_URL',
      label: 'Base URL Override',
      required: false,
      secret: false,
      aliases: ['DERIBIT_URL'],
    },
  ],
  notes: [
    'Deribit testnet API credentials (https://test.deribit.com) are free and distinct from live credentials.',
    'Options execution supports BTC, ETH, and SOL contracts with portfolio Greeks and margin tracking.',
  ],
  setupDefaults() {
    return {
      DERIBIT_TESTNET: 'true',
      DERIBIT_BASE_URL: TESTNET_BASE_URL,
    };
  },
};

function buildDeribitReport(env = process.env, options = {}) {
  return buildBrokerReport(spec, env, options);
}

function resolveDeribitSettings(env = process.env, options = {}) {
  const isTestnet = options.testnet !== undefined
    ? Boolean(options.testnet)
    : (getEnvValue(env, ['DERIBIT_TESTNET'], 'true').toLowerCase() !== 'false');

  const defaultBaseUrl = isTestnet ? TESTNET_BASE_URL : LIVE_BASE_URL;

  return {
    testnet: isTestnet,
    baseUrl: options.baseUrl
      || getEnvValue(env, ['DERIBIT_BASE_URL'])
      || defaultBaseUrl,
    clientId: options.clientId !== undefined
      ? options.clientId
      : (options.apiKey !== undefined ? options.apiKey : getEnvValue(env, ['DERIBIT_CLIENT_ID', 'DERIBIT_API_KEY', 'DERIBIT_KEY'])),
    clientSecret: options.clientSecret !== undefined
      ? options.clientSecret
      : (options.apiSecret !== undefined ? options.apiSecret : getEnvValue(env, ['DERIBIT_CLIENT_SECRET', 'DERIBIT_API_SECRET', 'DERIBIT_SECRET'])),
  };
}

module.exports = {
  spec,
  TESTNET_BASE_URL,
  LIVE_BASE_URL,
  buildDeribitReport,
  resolveDeribitSettings,
};
