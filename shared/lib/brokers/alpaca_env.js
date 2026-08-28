const { buildBrokerReport, getEnvValue } = require('./common');

const PAPER_BASE_URL = 'https://paper-api.alpaca.markets';
const LIVE_BASE_URL = 'https://api.alpaca.markets';

const spec = {
  broker: 'alpaca',
  displayName: 'Alpaca Paper',
  defaultHost: PAPER_BASE_URL,
  hostKeys: ['ALPACA_PAPER_BASE_URL', 'ALPACA_BASE_URL'],
  fields: [
    {
      key: 'ALPACA_PAPER_API_KEY',
      label: 'Paper API Key',
      required: true,
      secret: true,
      aliases: ['ALPACA_API_KEY', 'ALPACA_KEY'],
    },
    {
      key: 'ALPACA_PAPER_SECRET_KEY',
      label: 'Paper Secret Key',
      required: true,
      secret: true,
      aliases: ['ALPACA_SECRET_KEY', 'ALPACA_API_SECRET'],
    },
    {
      key: 'ALPACA_PAPER_BASE_URL',
      label: 'Paper Base URL',
      required: false,
      secret: false,
      aliases: ['ALPACA_BASE_URL', 'ALPACA_URL'],
    },
  ],
  notes: [
    'Paper and live credentials are distinct. Live credentials must stay on a local or private execution runner.',
  ],
  setupDefaults() {
    return { ALPACA_PAPER_BASE_URL: PAPER_BASE_URL };
  },
};

function buildAlpacaReport(env = process.env, options = {}) {
  return buildBrokerReport(spec, env, options);
}

function resolveAlpacaSettings(env = process.env, options = {}) {
  const legacyBaseUrl = getEnvValue(env, ['ALPACA_BASE_URL', 'ALPACA_URL']);
  const hasPaperSettings = Boolean(getEnvValue(env, [
    'ALPACA_PAPER_API_KEY',
    'ALPACA_PAPER_SECRET_KEY',
    'ALPACA_PAPER_BASE_URL',
  ]));
  const hasLiveSettings = Boolean(getEnvValue(env, [
    'ALPACA_LIVE_API_KEY',
    'ALPACA_LIVE_SECRET_KEY',
    'ALPACA_LIVE_BASE_URL',
  ]));
  const paper = options.paper ?? (
    options.baseUrl
      ? /paper/i.test(String(options.baseUrl))
      : hasPaperSettings || (!hasLiveSettings && /paper/i.test(String(legacyBaseUrl || PAPER_BASE_URL)))
  );
  const scopedNames = paper
    ? {
      base: ['ALPACA_PAPER_BASE_URL'],
      key: ['ALPACA_PAPER_API_KEY'],
      secret: ['ALPACA_PAPER_SECRET_KEY'],
      defaultBase: PAPER_BASE_URL,
    }
    : {
      base: ['ALPACA_LIVE_BASE_URL'],
      key: ['ALPACA_LIVE_API_KEY'],
      secret: ['ALPACA_LIVE_SECRET_KEY'],
      defaultBase: LIVE_BASE_URL,
    };
  const legacyMatchesScope = !legacyBaseUrl || /paper/i.test(legacyBaseUrl) === paper;
  const baseUrl = options.baseUrl
    || getEnvValue(env, scopedNames.base)
    || (legacyMatchesScope ? legacyBaseUrl : null)
    || scopedNames.defaultBase;
  const keyId = options.keyId
    || getEnvValue(env, scopedNames.key)
    || (legacyMatchesScope ? getEnvValue(env, ['ALPACA_API_KEY', 'ALPACA_KEY']) : null);
  const secretKey = options.secretKey
    || getEnvValue(env, scopedNames.secret)
    || (legacyMatchesScope ? getEnvValue(env, ['ALPACA_SECRET_KEY', 'ALPACA_API_SECRET']) : null);

  return {
    baseUrl,
    keyId,
    secretKey,
    paper,
    credentialScope: paper ? 'paper' : 'live',
  };
}

const ALPACA_SUPPORTED_CRYPTO_PAIRS = Object.freeze(new Set([
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'DOGE/USD', 'XRP/USD',
  'ADA/USD', 'AVAX/USD', 'LINK/USD', 'LTC/USD', 'BCH/USD',
  'UNI/USD', 'AAVE/USD', 'SHIB/USD', 'PEPE/USD', 'SUI/USD',
  'DOT/USD', 'TRX/USD', 'NEAR/USD', 'POL/USD', 'MATIC/USD',
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT',
  'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'LTCUSDT', 'BCHUSDT',
  'UNIUSDT', 'AAVEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'SUIUSDT',
  'DOTUSDT', 'TRXUSDT', 'NEARUSDT', 'POLUSDT', 'MATICUSDT',
]));

function isAlpacaTradable(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) return false;
  // If crypto pattern, verify against supported crypto pairs
  const isCrypto = /^(BTC|ETH|SOL|DOGE|XRP|ADA|AVAX|LINK|LTC|BCH|UNI|AAVE|SHIB|PEPE|SUI|DOT|TRX|NEAR|POL|MATIC|BNB|APT)(USDT|USDC|USD)$/.test(sym) || sym.includes('/');
  if (isCrypto) {
    return ALPACA_SUPPORTED_CRYPTO_PAIRS.has(sym);
  }
  // Standard US equities & ETFs (e.g. SPY, QQQ, AAPL, NVDA, MSFT)
  return /^[A-Z]{1,5}$/.test(sym);
}

module.exports = {
  LIVE_BASE_URL,
  PAPER_BASE_URL,
  spec,
  buildAlpacaReport,
  resolveAlpacaSettings,
  ALPACA_SUPPORTED_CRYPTO_PAIRS,
  isAlpacaTradable,
};
