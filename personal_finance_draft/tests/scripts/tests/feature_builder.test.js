'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { buildMLFeatureFrame } = require('../../../shared/lib/ml/feature_builder');

// Build N daily OHLCV bars for one symbol with a deterministic close path.
function makeBars(n, closeFn) {
  const bars = [];
  for (let i = 0; i < n; i += 1) {
    const close = closeFn(i);
    const day = String(i + 1).padStart(2, '0');
    bars.push({
      symbol: 'TEST', family: 'crypto', timeframe: '1d',
      timestamp: `2026-01-${day}T00:00:00.000Z`,
      open: close, high: close * 1.01, low: close * 0.99, close, volume: 1000 + i,
    });
  }
  return bars;
}

test('buildMLFeatureFrame emits labels, cross-family columns, and is point-in-time', () => {
  const n = 30;
  const horizon = 3;
  const bars = makeBars(n, (i) => 100 + i); // strictly rising close: 100,101,...,129
  // Anchor with matching daily dates, rising too.
  const anchor = [];
  for (let i = 0; i < n; i += 1) {
    anchor.push({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, value: 50 + i * 2 });
  }

  const frame = buildMLFeatureFrame({
    assetSources: bars,
    anchors: { GOLD: anchor },
    horizon,
    corrPeriod: 5,
    minimumBars: 7,
  });

  assert.strictEqual(frame.meta.assets, 1);
  assert.ok(frame.features.length > 0, 'rows produced');

  // Cross-family columns present.
  assert.ok(frame.feature_names.includes('xf_corr_GOLD'), 'corr column');
  assert.ok(frame.feature_names.includes('regime_GOLD_mom'), 'regime momentum column');

  // Label correctness: rising series -> every labeled row is class 2 (up) with positive fwd return.
  for (const row of frame.features) {
    assert.strictEqual(row.label_horizon, horizon);
    assert.ok(row.label_fwd_return > 0, 'rising series -> positive fwd return');
    assert.strictEqual(row.label_class, 2, 'rising series -> up class');
    assert.ok([0, 1, 2].includes(row.label_class));
  }

  // Spot-check one row's forward return against raw closes.
  const first = frame.features[0];
  const idx = Number(first.as_of.slice(8, 10)) - 1; // day -> 0-based bar index
  const expected = (100 + idx + horizon) / (100 + idx) - 1;
  assert.ok(Math.abs(first.label_fwd_return - expected) < 1e-9, 'fwd return matches closes');

  // Point-in-time: the last `horizon` eligible bars have no full forward window -> dropped.
  assert.ok(frame.meta.dropped_no_label >= horizon, 'tail rows without forward window dropped');
});

test('buildMLFeatureFrame 3-class deadzone produces flat labels for small moves', () => {
  const n = 24;
  // Oscillating tiny moves around 100 so |fwd return| stays within the deadzone.
  const bars = makeBars(n, (i) => 100 + (i % 2 === 0 ? 0 : 0.001));
  const frame = buildMLFeatureFrame({
    assetSources: bars,
    anchors: {},
    horizon: 2,
    corrPeriod: 4,
    minimumBars: 6,
    deadzone: 0.01, // 1% deadzone; moves are ~0.001 -> flat
  });
  assert.ok(frame.features.length > 0);
  assert.ok(frame.features.every((r) => r.label_class === 1), 'tiny moves -> flat class');
});
