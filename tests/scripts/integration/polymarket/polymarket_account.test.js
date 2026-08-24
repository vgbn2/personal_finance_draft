const assert = require('node:assert/strict');
const test = require('node:test');

require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  experimentalResolver: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'node',
    target: 'ES2020',
    esModuleInterop: true,
    ignoreDeprecations: '6.0',
  },
});

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
} = require('../../../../backend/gateway/src/polymarket/index.ts');
const { resolvePolymarketClientSettings } = require('../../../../shared/lib/brokers/polymarket_env.js');

test('wallet resolver accepts the legacy mixed-case wallet env alias', () => {
  const env = {
    POLYMARKET_WAllET_ADDRESS: '0xlegacy',
  };

  assert.equal(getConfiguredWalletAddress(env), '0xlegacy');
  assert.equal(resolvePolymarketClientSettings(env).funderAddress, '0xlegacy');
});

test('signature type resolver prioritizes explicit SIGNATURE_TYPE before wallet defaults', () => {
  const env = {
    POLYMARKET_SIGNATURE_TYPE: '1',
    DEPOSIT_ADDRESS: '0xdeposit',
  };

  assert.equal(getConfiguredSignatureType(env), 1);
});

test('signature type defaults to POLY_GNOSIS_SAFE when deposit wallet is present', () => {
  const env = {
    DEPOSIT_ADDRESS: '0xdeposit',
  };

  assert.equal(getConfiguredSignatureType(env), 2);
  assert.equal(resolvePolymarketClientSettings(env).signatureType, 2);
});

test('signature type defaults to POLY_PROXY when funder matches PROXY_ADDRESS', () => {
  const env = {
    PROXY_ADDRESS: '0xproxy',
    POLYMARKET_FUNDER_ADDRESS: '0xproxy',
  };

  assert.equal(getConfiguredSignatureType(env), 1);
  assert.equal(resolvePolymarketClientSettings(env).signatureType, 1);
});

test('assertValidPrivateKey accepts 0x prefix followed by 64 hex characters', () => {
  assert.doesNotThrow(() => {
    assertValidPrivateKey('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  });

  assert.throws(() => {
    assertValidPrivateKey('0xshort');
  }, /is malformed/);

  assert.throws(() => {
    assertValidPrivateKey('');
  }, /not set/);
});

test('buildTradePagination identifies truncated trade fetches at page cap', () => {
  const truncated = buildTradePagination(5, 500, 5, 'next-cursor-token');
  assert.deepEqual(truncated, {
    pages_fetched: 5,
    trades_fetched: 500,
    page_cap: 5,
    truncated: true,
    next_cursor: 'next-cursor-token',
  });

  const complete = buildTradePagination(2, 120, 5, null);
  assert.deepEqual(complete, {
    pages_fetched: 2,
    trades_fetched: 120,
    page_cap: 5,
    truncated: false,
  });
});

test('mode candidate generator produces deduplicated list of plausible auth combinations', () => {
  const env = {
    PROFILE_ADDRESS: '0xprofile',
    RELAYER_API_KEY_ADDRESS: '0xrelayer',
    PROXY_ADDRESS: '0xproxy',
    DEPOSIT_ADDRESS: '0xdeposit',
  };

  const candidates = polymarketModeCandidates(env);
  assert.ok(candidates.length >= 4);
  assert.equal(candidates[0].name, 'sig0-none');
  assert.equal(candidates[1].name, 'sig1-proxy');
  assert.equal(candidates[2].name, 'sig2-deposit');
});

test('probe candidate generator creates sig1 and sig2 candidates for a target address', () => {
  const candidates = polymarketProbeCandidates('0xtarget');
  assert.deepEqual(candidates, [
    { name: 'sig1-address', signatureType: 1, funderAddress: '0xtarget' },
    { name: 'sig2-address', signatureType: 2, funderAddress: '0xtarget' },
  ]);
});

test('address roles summary reflects env bindings and calculated signature type', () => {
  const env = {
    PROFILE_ADDRESS: '0xprofile',
    PROXY_ADDRESS: '0xproxy',
    DEPOSIT_ADDRESS: '0xdeposit',
  };

  const roles = polymarketAddressRoles(env);
  assert.equal(roles.profile, '0xprofile');
  assert.equal(roles.proxy, '0xproxy');
  assert.equal(roles.deposit, '0xdeposit');
  assert.equal(roles.configuredFunder, '0xdeposit');
  assert.equal(roles.configuredSignatureType, 2);
});

test('debug and collateral probe snapshot builders format structured outputs', () => {
  const debug = buildPolymarketDebugSnapshot({
    signerAddress: '0xsigner',
    funderAddress: '0xfunder',
    signatureType: 2,
    collateral: { balance: 10, allowance: 100, asset_type: 'COLLATERAL' },
    openOrders: [{}],
    positions: [{}, {}],
    tradePagination: { trades_fetched: 5 },
  });

  assert.equal(debug.ok, true);
  assert.equal(debug.walletMode, 'POLY_GNOSIS_SAFE');
  assert.equal(debug.openOrderCount, 1);
  assert.equal(debug.positionCount, 2);
  assert.equal(debug.accountState, 'funded');

  const probe = buildPolymarketCollateralProbeSnapshot({
    signerAddress: '0xsigner',
    funderAddress: '0xfunder',
    signatureType: 2,
    collateral: { balance: 0, allowance: 50, asset_type: 'COLLATERAL' },
  });

  assert.equal(probe.ok, true);
  assert.equal(probe.accountState, 'allowance_present_balance_zero');
});
