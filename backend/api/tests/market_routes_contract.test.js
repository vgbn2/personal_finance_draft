'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  isValidSymbol,
  isValidTimeframe,
  isValidSignalId,
  isValidPromotionId,
  isPathWithinAllowedRoots,
  sanitizeSymbol,
} = require('../server/services/input_validator');

const {
  checkSnapshotReadiness,
  checkDataSeriesSufficiency,
} = require('../server/services/data_readiness');

const sigmaBandRoute = require('../server/routes/market/sigma_band');

test('input_validator - symbol validation & sanitization', () => {
  assert.equal(isValidSymbol('AAPL'), true);
  assert.equal(isValidSymbol('BTC-USD'), true);
  assert.equal(isValidSymbol('EUR_USD'), true);
  assert.equal(isValidSymbol('INVALID/SYMBOL'), false);
  assert.equal(isValidSymbol(''), false);
  assert.equal(isValidSymbol('A'.repeat(25)), false);

  assert.equal(sanitizeSymbol(' aapl '), 'AAPL');
  assert.equal(sanitizeSymbol('invalid/sym'), null);
});

test('input_validator - timeframe validation', () => {
  assert.equal(isValidTimeframe('1m'), true);
  assert.equal(isValidTimeframe('1h'), true);
  assert.equal(isValidTimeframe('1d'), true);
  assert.equal(isValidTimeframe('2d'), false);
  assert.equal(isValidTimeframe('invalid'), false);
});

test('input_validator - signal & promotion ID validation', () => {
  assert.equal(isValidSignalId('sig_12345_AAPL'), true);
  assert.equal(isValidSignalId('sig!bad'), false);
  assert.equal(isValidPromotionId('promote:signal:abc123hash'), true);
  assert.equal(isValidPromotionId(''), false);
});

test('input_validator - path traversal shielding', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const allowed = [repoRoot];

  assert.equal(isPathWithinAllowedRoots(path.join(repoRoot, 'storage', 'data'), allowed), true);
  assert.equal(isPathWithinAllowedRoots(path.join(repoRoot, '..', 'etc', 'passwd'), allowed), false);
});

test('data_readiness - snapshot readiness check', () => {
  const missingResult = checkSnapshotReadiness(path.join(__dirname, 'non_existent_file.json'));
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.error_code, 'snapshot_not_found');
  assert.equal(missingResult.status, 503);
});

test('data_readiness - series sufficiency check', () => {
  const insufficient = checkDataSeriesSufficiency([1, 2, 3], 10);
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.error_code, 'insufficient_bars');
  assert.equal(insufficient.status, 422);

  const sufficient = checkDataSeriesSufficiency([1, 2, 3, 4, 5], 5);
  assert.equal(sufficient.ok, true);
  assert.equal(sufficient.bars_count, 5);
});

test('sigma_band route - status status code mapping', () => {
  assert.equal(sigmaBandRoute.status({ ok: true }), 200);
  assert.equal(sigmaBandRoute.status({ ok: false, error: 'snapshot_not_found' }), 503);
  assert.equal(sigmaBandRoute.status({ ok: false, error: 'insufficient_bars' }), 422);
  assert.equal(sigmaBandRoute.status(null), 503);
});
