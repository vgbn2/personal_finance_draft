const { buildBrokerReport, getEnvValue } = require('./common');

function resolveSignatureType(env) {
  const explicit = String(env.POLYMARKET_SIGNATURE_TYPE || '').trim();
  if (explicit !== '' && Number.isFinite(Number(explicit))) return Number(explicit);
  const funderAddress = resolveWalletAddress(env);
  const proxyAddress = String(env.PROXY_ADDRESS || '').trim();
  if (proxyAddress && funderAddress && String(funderAddress).toLowerCase() === proxyAddress.toLowerCase()) {
    return 1;
  }
  if (String(env.POLYMARKET_FUNDER_ADDRESS || env.DEPOSIT_ADDRESS || env.POLYMARKET_WALLET_ADDRESS || env.POLYMARKET_WAllET_ADDRESS || '').trim()) return 2;
  if (proxyAddress) return 1;
  return 0;
}

function resolveWalletAddress(env) {
  return String(
    env.POLYMARKET_FUNDER_ADDRESS
    || env.DEPOSIT_ADDRESS
    || env.POLYMARKET_WALLET_ADDRESS
    || env.POLYMARKET_WAllET_ADDRESS
    || env.PROXY_ADDRESS
    || ''
  ).trim() || undefined;
}

const spec = {
  broker: 'polymarket',
  displayName: 'Polymarket',
  defaultHost: 'https://clob.polymarket.com',
  hostKeys: ['POLYMARKET_CLOB_HOST'],
  fields: [
    { key: 'POLYMARKET_PRIVATE_KEY', label: 'Private Key', required: true, secret: true },
    { key: 'POLYMARKET_API_KEY', label: 'L2 API Key', required: false, secret: true },
    { key: 'POLYMARKET_API_SECRET', label: 'L2 API Secret', required: false, secret: true },
    { key: 'POLYMARKET_API_PASSPHRASE', label: 'L2 API Passphrase', required: false, secret: true },
    { key: 'POLYMARKET_WALLET_ADDRESS', label: 'Wallet Address', required: false, secret: false },
    { key: 'POLYMARKET_FUNDER_ADDRESS', label: 'Funder Address', required: false, secret: false },
    { key: 'POLYMARKET_SIGNATURE_TYPE', label: 'Signature Type', required: false, secret: false },
    { key: 'POLYMARKET_CLOB_HOST', label: 'CLOB Host', required: false, secret: false },
  ],
  notes: [
    'Private keys stay local; shared cloud must not hold Polymarket secrets by default.',
    'The canonical deposit-wallet signature type is 2 when a funder address is present.',
  ],
  resolveMode: resolveSignatureType,
  setupDefaults(env, values) {
    const host = String(values.POLYMARKET_CLOB_HOST || env.POLYMARKET_CLOB_HOST || '').trim();
    return host ? { POLYMARKET_CLOB_HOST: host } : {};
  },
};

function buildPolymarketReport(env = process.env, options = {}) {
  const report = buildBrokerReport(spec, env, options);
  report.wallet_address = resolveWalletAddress(env) || null;
  report.signature_type = resolveSignatureType(env);
  return report;
}

function resolvePolymarketClientSettings(env = process.env, options = {}) {
  const host = options.host
    || getEnvValue(env, ['POLYMARKET_CLOB_HOST'])
    || spec.defaultHost;
  const privateKey = options.privateKey
    || getEnvValue(env, ['POLYMARKET_PRIVATE_KEY']);
  const apiKey = options.apiKey
    || getEnvValue(env, ['POLYMARKET_API_KEY']);
  const apiSecret = options.apiSecret
    || getEnvValue(env, ['POLYMARKET_API_SECRET']);
  const apiPassphrase = options.apiPassphrase
    || getEnvValue(env, ['POLYMARKET_API_PASSPHRASE']);
  const funderAddress = options.funderAddress || resolveWalletAddress(env);
  const signatureType = options.signatureType ?? (() => {
    const explicit = String(env.POLYMARKET_SIGNATURE_TYPE || '').trim();
    if (explicit !== '' && Number.isFinite(Number(explicit))) return Number(explicit);
    if (String(env.PROXY_ADDRESS || '').trim() && funderAddress && String(funderAddress).toLowerCase() === String(env.PROXY_ADDRESS).toLowerCase()) {
      return 1;
    }
    const depositAddress = String(env.POLYMARKET_FUNDER_ADDRESS || env.DEPOSIT_ADDRESS || env.POLYMARKET_WALLET_ADDRESS || env.POLYMARKET_WAllET_ADDRESS || '').trim();
    if (depositAddress && funderAddress && String(funderAddress).toLowerCase() === depositAddress.toLowerCase()) {
      return 2;
    }
    if (funderAddress) return 2;
    return 0;
  })();
  const creds = (apiKey && apiSecret && apiPassphrase) ? { key: apiKey, secret: apiSecret, passphrase: apiPassphrase } : null;

  return {
    host,
    privateKey,
    apiKey,
    apiSecret,
    apiPassphrase,
    creds,
    funderAddress,
    signatureType,
  };
}

module.exports = { spec, buildPolymarketReport, resolveSignatureType, resolveWalletAddress, resolvePolymarketClientSettings };
