const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assertValidPrivateKey,
  buildPolymarketCollateralProbeSnapshot,
  buildPolymarketDebugSnapshot,
  buildTradePagination,
  getConfiguredSignatureType,
  getConfiguredWalletAddress,
  polymarketAddressRoles,
  polymarketModeCandidates,
  polymarketProbeCandidates,
  // shared env layer for compatibility smoke
} = require('../../../backend/gateway/src/polymarket_account.js');
const { resolvePolymarketClientSettings } = require('../../../shared/lib/brokers/polymarket_env.js');

test('wallet resolver accepts the legacy mixed-case wallet env alias', () => {
  const env = {
    POLYMARKET_WAllET_ADDRESS: '0xlegacy',
  };
  assert.equal(getConfiguredWalletAddress(env), '0xlegacy');
  assert.equal(getConfiguredSignatureType(env), 2);
});

test('deposit address is preferred over legacy proxy and infers signature type 2', () => {
  const env = {
    PROXY_ADDRESS: '0xproxy',
    DEPOSIT_ADDRESS: '0xdeposit',
  };
  assert.equal(getConfiguredWalletAddress(env), '0xdeposit');
  assert.equal(getConfiguredSignatureType(env), 2);
});

test('shared polymarket client settings use deposit wallet before proxy fallback', () => {
  const env = {
    PROXY_ADDRESS: '0xproxy',
    DEPOSIT_ADDRESS: '0xdeposit',
    POLYMARKET_PRIVATE_KEY: '0x' + '1'.repeat(64),
  };
  const settings = resolvePolymarketClientSettings(env);
  assert.equal(settings.funderAddress, '0xdeposit');
  assert.equal(settings.signatureType, 2);
});

test('shared polymarket client settings still fall back to proxy when no deposit wallet is configured', () => {
  const env = {
    PROXY_ADDRESS: '0xproxy',
    POLYMARKET_PRIVATE_KEY: '0x' + '1'.repeat(64),
  };
  const settings = resolvePolymarketClientSettings(env);
  assert.equal(settings.funderAddress, '0xproxy');
  assert.equal(settings.signatureType, 1);
});

test('mode candidates include the main signature and funder combinations without duplicates', () => {
  const env = {
    PROFILE_ADDRESS: '0xprofile',
    RELAYER_API_KEY_ADDRESS: '0xrelayer',
    PROXY_ADDRESS: '0xproxy',
    DEPOSIT_ADDRESS: '0xdeposit',
  };
  const candidates = polymarketModeCandidates(env);
  assert.deepEqual(candidates, [
    { name: 'sig0-none', signatureType: 0, funderAddress: undefined },
    { name: 'sig1-proxy', signatureType: 1, funderAddress: '0xproxy' },
    { name: 'sig2-deposit', signatureType: 2, funderAddress: '0xdeposit' },
    { name: 'sig1-profile', signatureType: 1, funderAddress: '0xprofile' },
    { name: 'sig2-profile', signatureType: 2, funderAddress: '0xprofile' },
    { name: 'sig1-relayer', signatureType: 1, funderAddress: '0xrelayer' },
    { name: 'sig2-relayer', signatureType: 2, funderAddress: '0xrelayer' },
  ]);
});

test('probe candidates generate signature type 1 and 2 for a target address', () => {
  assert.deepEqual(polymarketProbeCandidates('0xabc'), [
    { name: 'sig1-address', signatureType: 1, funderAddress: '0xabc' },
    { name: 'sig2-address', signatureType: 2, funderAddress: '0xabc' },
  ]);
});

test('address roles expose configured topology fields', () => {
  const env = {
    PROFILE_ADDRESS: '0xprofile',
    RELAYER_API_KEY_ADDRESS: '0xrelayer',
    PROXY_ADDRESS: '0xproxy',
    DEPOSIT_ADDRESS: '0xdeposit',
  };
  assert.deepEqual(polymarketAddressRoles(env), {
    signer: null,
    profile: '0xprofile',
    relayer: '0xrelayer',
    proxy: '0xproxy',
    deposit: '0xdeposit',
    configuredFunder: '0xdeposit',
    configuredSignatureType: 2,
  });
});

test('invalid private key shape is rejected with a clear error', () => {
  assert.throws(
    () => assertValidPrivateKey('0x4698'),
    /POLYMARKET_PRIVATE_KEY is malformed/
  );
});

test('trade pagination is not flagged truncated when no trades were returned', () => {
  const pagination = buildTradePagination(1, 0, 10, 'LTE=');
  assert.deepEqual(pagination, {
    pages_fetched: 1,
    trades_fetched: 0,
    page_cap: 10,
    truncated: false,
  });
});

test('debug snapshot classifies zero-balance deposit-wallet state with allowance separately', () => {
  const snapshot = buildPolymarketDebugSnapshot({
    signerAddress: '0xsigner',
    funderAddress: '0xfunder',
    signatureType: 2,
    collateral: { balance: 0, allowance: 42 },
    openOrders: [],
    positions: [],
    tradePagination: { pages_fetched: 1, trades_fetched: 0, page_cap: 10, truncated: false },
  });

  assert.equal(snapshot.accountState, 'allowance_present_balance_zero');
  assert.equal(snapshot.collateral.allowance, 42);
  assert.equal(snapshot.walletMode, 'POLY_GNOSIS_SAFE');
});

test('collateral probe snapshot stays lightweight and does not infer missing activity', () => {
  const snapshot = buildPolymarketCollateralProbeSnapshot({
    signerAddress: '0xsigner',
    funderAddress: '0xfunder',
    signatureType: 1,
    collateral: { balance: 0, allowance: 0 },
  });

  assert.equal(snapshot.accountState, 'balance_zero');
  assert.equal(snapshot.walletMode, 'POLY_PROXY');
  assert.equal(snapshot.collateral.balance, 0);
});
