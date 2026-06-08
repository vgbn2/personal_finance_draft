const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildLegacyEnvBridge,
  normalizeLegacyPolymarketEnv,
  resolveLegacySignatureType,
} = require('../../../legacy/holygrailpoly/legacy_clob.js');

function summarizeCollateralProbe(payload) {
  if (!payload || !payload.ok) return { ok: false };
  return {
    ok: true,
    signer: payload.signerAddress,
    funder: payload.funderAddress,
    signatureType: payload.signatureType,
    balance: payload.collateral && payload.collateral.balance,
    allowance: payload.collateral && payload.collateral.allowance,
    accountState: payload.accountState,
  };
}

test('legacy env bridge maps POLY_* names to polymarket env names', () => {
  const normalized = normalizeLegacyPolymarketEnv({
    POLY_PRIVATE_KEY: '0x' + '1'.repeat(64),
    POLY_FUNDER_ADDRESS: '0xabc',
    POLY_SIGNATURE_TYPE: '3',
    POLY_API_KEY: 'k',
    POLY_API_SECRET: 's',
    POLY_API_PASSPHRASE: 'p',
  });
  assert.equal(normalized.POLYMARKET_PRIVATE_KEY.startsWith('0x1'), true);
  assert.equal(normalized.POLYMARKET_FUNDER_ADDRESS, '0xabc');
  assert.equal(normalized.POLYMARKET_SIGNATURE_TYPE, '3');
  assert.equal(normalized.POLYMARKET_API_KEY, 'k');
});

test('legacy signature type falls back to proxy or deposit mode', () => {
  assert.equal(resolveLegacySignatureType({
    PROXY_ADDRESS: '0xproxy',
    POLY_FUNDER_ADDRESS: '0xproxy',
  }, '0xproxy'), 1);
  assert.equal(resolveLegacySignatureType({
    POLY_FUNDER_ADDRESS: '0xdeposit',
  }, '0xdeposit'), 3);
});

test('legacy env bridge preserves canonical fields', () => {
  const bridged = buildLegacyEnvBridge({
    POLY_PRIVATE_KEY: '0x' + '1'.repeat(64),
  });
  assert.equal(bridged.POLYMARKET_PRIVATE_KEY.length, 66);
});

test('legacy collateral probe summary keeps only lightweight balance fields', () => {
  const summary = summarizeCollateralProbe({
    ok: true,
    signerAddress: '0xsigner',
    funderAddress: '0xfunder',
    signatureType: 3,
    collateral: { balance: 0, allowance: 7 },
    accountState: 'allowance_present_balance_zero',
  });
  assert.deepEqual(summary, {
    ok: true,
    signer: '0xsigner',
    funder: '0xfunder',
    signatureType: 3,
    balance: 0,
    allowance: 7,
    accountState: 'allowance_present_balance_zero',
  });
});
