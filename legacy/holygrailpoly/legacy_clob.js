const crypto = require('node:crypto');

function normalizeLegacyPolymarketEnv(env = process.env) {
  const pick = (...keys) => {
    for (const key of keys) {
      if (env[key] !== undefined && env[key] !== '') return env[key];
    }
    return undefined;
  };

  return {
    POLYMARKET_PRIVATE_KEY: pick('POLYMARKET_PRIVATE_KEY', 'POLY_PRIVATE_KEY'),
    POLYMARKET_FUNDER_ADDRESS: pick('POLYMARKET_FUNDER_ADDRESS', 'POLY_FUNDER_ADDRESS', 'PROXY_ADDRESS', 'DEPOSIT_ADDRESS'),
    POLYMARKET_SIGNATURE_TYPE: pick('POLYMARKET_SIGNATURE_TYPE', 'POLY_SIGNATURE_TYPE'),
    POLYMARKET_API_KEY: pick('POLYMARKET_API_KEY', 'POLY_API_KEY'),
    POLYMARKET_API_SECRET: pick('POLYMARKET_API_SECRET', 'POLY_API_SECRET'),
    POLYMARKET_API_PASSPHRASE: pick('POLYMARKET_API_PASSPHRASE', 'POLY_API_PASSPHRASE'),
    POLYMARKET_CLOB_HOST: pick('POLYMARKET_CLOB_HOST', 'POLY_API_HOST'),
  };
}

function isValidPrivateKey(privateKey) {
  return typeof privateKey === 'string' && /^0x[0-9a-fA-F]{64}$/.test(privateKey);
}

function assertValidPrivateKey(privateKey, fieldName = 'POLYMARKET_PRIVATE_KEY') {
  if (!privateKey) {
    throw new Error(`${fieldName} not set`);
  }
  if (!isValidPrivateKey(privateKey)) {
    throw new Error(`${fieldName} is malformed; expected 0x followed by 64 hex characters`);
  }
}

function resolveLegacySignatureType(env = process.env, funderAddress = normalizeLegacyPolymarketEnv(env).POLYMARKET_FUNDER_ADDRESS) {
  const raw = env.POLYMARKET_SIGNATURE_TYPE ?? env.POLY_SIGNATURE_TYPE;
  if (raw !== undefined && raw !== '') {
    const parsed = Number(raw);
    if (Number.isInteger(parsed)) return parsed;
  }
  const proxy = env.PROXY_ADDRESS;
  if (proxy && funderAddress && String(proxy).toLowerCase() === String(funderAddress).toLowerCase()) {
    return 1;
  }
  if (funderAddress) return 3;
  return undefined;
}

function resolveLegacyOwnerAddress(env = process.env) {
  const normalized = normalizeLegacyPolymarketEnv(env);
  return normalized.POLYMARKET_FUNDER_ADDRESS || null;
}

async function createLegacyClobClient(opts = {}) {
  const { ClobClient } = await import('@polymarket/clob-client');
  const normalizedEnv = normalizeLegacyPolymarketEnv(process.env);
  const host = opts.host || normalizedEnv.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  const pk = opts.privateKey || normalizedEnv.POLYMARKET_PRIVATE_KEY;

  if (!pk) return new ClobClient(host, 137);
  assertValidPrivateKey(pk);

  const { Wallet } = await import('ethers');
  const signer = new Wallet(pk);
  const creds = opts.withCreds
    ? (opts.creds || {
      key: normalizedEnv.POLYMARKET_API_KEY,
      secret: normalizedEnv.POLYMARKET_API_SECRET,
      passphrase: normalizedEnv.POLYMARKET_API_PASSPHRASE,
    })
    : undefined;

  const funderAddress = opts.funderAddress || normalizedEnv.POLYMARKET_FUNDER_ADDRESS;
  const signatureType = opts.signatureType ?? resolveLegacySignatureType(process.env, funderAddress);
  return new ClobClient(host, 137, signer, creds, signatureType, funderAddress);
}

function buildHmacSignature(secret, ts, method, path) {
  const message = `${ts}GET${path}`;
  const key = Buffer.from(secret, 'base64');
  const sig = crypto.createHmac('sha256', key).update(message).digest('base64');
  return sig.replace(/\+/g, '-').replace(/\//g, '_');
}

function buildL2Headers(address, creds, requestPath) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = buildHmacSignature(creds.secret, ts, 'GET', requestPath);
  return {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: sig,
    POLY_TIMESTAMP: `${ts}`,
    POLY_API_KEY: creds.key,
    POLY_PASSPHRASE: creds.passphrase,
    'User-Agent': '@polymarket/clob-client',
    Accept: '*/*',
  };
}

async function legacyPolymarketGet(path, queryParams = {}, opts = {}) {
  const normalizedEnv = normalizeLegacyPolymarketEnv(process.env);
  const host = opts.host || normalizedEnv.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';
  const creds = opts.creds || {
    key: normalizedEnv.POLYMARKET_API_KEY || '',
    secret: normalizedEnv.POLYMARKET_API_SECRET || '',
    passphrase: normalizedEnv.POLYMARKET_API_PASSPHRASE || '',
  };
  const pk = opts.privateKey || normalizedEnv.POLYMARKET_PRIVATE_KEY || '';
  assertValidPrivateKey(pk);

  const { Wallet } = await import('ethers');
  const signerAddress = new Wallet(pk).address;
  const axios = require('axios');
  const url = `${host}${path}`;
  const signatureType = opts.signatureType ?? resolveLegacySignatureType(process.env, opts.funderAddress);
  const headers = buildL2Headers(signerAddress, creds, path);
  const params = signatureType === undefined
    ? queryParams
    : { ...queryParams, signature_type: String(signatureType) };
  const resp = await axios.get(url, { headers, params });
  return resp.data;
}

function buildLegacyEnvBridge(env = process.env) {
  const normalized = normalizeLegacyPolymarketEnv(env);
  return {
    ...normalized,
    POLYMARKET_SIGNATURE_TYPE: normalized.POLYMARKET_SIGNATURE_TYPE ?? (normalized.POLYMARKET_FUNDER_ADDRESS ? '3' : undefined),
  };
}

module.exports = {
  assertValidPrivateKey,
  buildLegacyEnvBridge,
  createLegacyClobClient,
  legacyPolymarketGet,
  normalizeLegacyPolymarketEnv,
  resolveLegacyOwnerAddress,
  resolveLegacySignatureType,
  isValidPrivateKey,
};
