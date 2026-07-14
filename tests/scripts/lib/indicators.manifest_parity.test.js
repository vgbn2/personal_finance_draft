'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculateRollingFeatureFrame } = require('../../../shared/lib/market/indicators');

/**
 * TEST: MANIFEST PARITY
 *
 * Serves as a contract guard: manifest-mode featureFromWindow output must
 * contain every key the legacy hardcoded path produces.
 */
test('manifest-mode produces all expected legacy feature keys', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/real_bars_btc.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  const frame = calculateRollingFeatureFrame(fixture, 20, { rsi: 14, bollinger: 20 });
  assert.ok(frame.features.length > 0, 'Should produce features from real data');

  const latest = frame.features[frame.features.length - 1];

  // Scalar metadata keys
  const metaKeys = ['key', 'symbol', 'family', 'provider', 'timeframe', 'as_of', 'bars', 'close'];
  for (const k of metaKeys) {
    assert.ok(Object.prototype.hasOwnProperty.call(latest, k), `Missing metadata key: ${k}`);
  }

  // Indicator output keys
  const indicatorKeys = [
    'return_fast',
    'return_slow',
    'volatility',
    'rsi',
    'macd',
    'atr',
    'bollinger_upper',
    'bollinger_middle',
    'bollinger_lower',
    'smc_score',
    'smc_bias',
    'divergence_score',
  ];
  for (const k of indicatorKeys) {
    assert.ok(Object.prototype.hasOwnProperty.call(latest, k), `Missing indicator key: ${k}`);
  }

  // At least one session_volume_profile_* key
  const sessionKeys = Object.keys(latest).filter((k) => k.startsWith('session_volume_profile_'));
  assert.ok(sessionKeys.length > 0, 'Expected at least one session_volume_profile_* key');

  // Numeric sanity guards (NaN/missing regression)
  assert.ok(Number.isFinite(latest.volatility) && latest.volatility > 0,
    `Expected finite positive volatility, got ${latest.volatility}`);
  assert.ok(Number.isFinite(latest.return_fast),
    `Expected finite return_fast, got ${latest.return_fast}`);

  console.log(`[VISIBILITY] Latest volatility=${latest.volatility}, return_fast=${latest.return_fast}, atr=${latest.atr}`);
  console.log(`[VISIBILITY] Session volume keys: ${sessionKeys.join(', ')}`);
});
