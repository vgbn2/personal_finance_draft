const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculateRollingFeatureFrame } = require('../../../shared/lib/indicators');

/**
 * TEST: INDICATOR DATA FLOW (REAL DATA)
 * 
 * Verifies that the feature generator handles real market noise and 
 * volatility using a Binance BTCUSDT fixture.
 */
test('feature generator handles real market noise from Binance fixture', () => {
  const fixturePath = path.join(__dirname, '../../fixtures/real_bars_btc.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const bars = fixture.sources;
  
  const periods = { rsi: 14, bollinger: 20 };
  const frame = calculateRollingFeatureFrame(fixture, 20, periods);
  
  assert.ok(frame.features.length > 0, 'Should produce features from real data');
  const latest = frame.features[frame.features.length - 1];
  
  // Verify real-world volatility produces non-null results
  assert.ok(latest.rsi !== null, 'RSI should be calculated from real noise');
  assert.ok(latest.volatility > 0, 'Volatility should be positive in real market');
  assert.strictEqual(latest.symbol, 'BTCUSDT');
  
  console.log(`[VISIBILITY] Tested with ${bars.length} real BTC bars.`);
  console.log(`[VISIBILITY] Latest RSI: ${latest.rsi.toFixed(2)}`);
});
