'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPolymarketFeatureRows,
  estimatePolymarketExecutionCost,
  normalizePricePoints,
  rollingWindowBars,
} = require('../../../../shared/lib/market/polymarket_features');

function dailyPoint(dayIndex, p) {
  const start = Date.parse('2026-01-01T00:00:00.000Z');
  const ms = start + dayIndex * 24 * 60 * 60 * 1000;
  return { t: Math.floor(ms / 1000), iso: new Date(ms).toISOString(), p };
}

function closeTo(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('rollingWindowBars supports Polymarket 1d, 1h, and 5m windows', () => {
  assert.equal(rollingWindowBars('1d', 7), 7);
  assert.equal(rollingWindowBars('1h', 7), 168);
  assert.equal(rollingWindowBars('5m', 7), 2016);
  assert.equal(rollingWindowBars('1d', 14), 14);
  assert.throws(() => rollingWindowBars('15m', 7), /Unsupported Polymarket feature interval/);
});

test('normalizePricePoints sorts, dedupes, and filters invalid normalized points', () => {
  const points = [
    dailyPoint(2, 0.30),
    dailyPoint(0, 0.10),
    { ...dailyPoint(1, 0.20), p: 1.20 },
    dailyPoint(0, 0.15),
  ];

  const normalized = normalizePricePoints(points);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].p, 0.15, 'last duplicate timestamp wins');
  assert.equal(normalized[1].p, 0.30);
  assert.ok(normalized[0].iso < normalized[1].iso);
});

test('buildPolymarketFeatureRows is point-in-time and does not leak future prices', () => {
  const points = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 1.00]
    .map((p, i) => dailyPoint(i, p));

  const rows = buildPolymarketFeatureRows(points, {
    interval: '1d',
    marketEndTime: '2026-01-15T00:00:00.000Z',
  });

  assert.equal(rows.length, 8);
  closeTo(rows[6].p_ma_7d, 0.40);
  assert.equal(rows[6].p_momentum_7d, null, '7d momentum needs a full 7d lookback point');
  closeTo(rows[7].p_momentum_7d, 0.90);
  closeTo(rows[7].p_ma_7d, (0.20 + 0.30 + 0.40 + 0.50 + 0.60 + 0.70 + 1.00) / 7);
  closeTo(rows[7].time_to_resolution_hours, 7 * 24);
  closeTo(rows[7].elapsed_fraction, 7 / 14);

  const changedFuture = points.map((point, index) => (
    index === 7 ? { ...point, p: 0.01 } : point
  ));
  const changedRows = buildPolymarketFeatureRows(changedFuture, {
    interval: '1d',
    marketEndTime: '2026-01-15T00:00:00.000Z',
  });

  assert.deepEqual(rows[6], changedRows[6], 'future-only mutation must not affect prior feature row');
});

test('buildPolymarketFeatureRows computes volatility, z-score, drawdown, and elapsed fields', () => {
  const points = [0.50, 0.70, 0.60, 0.35].map((p, i) => dailyPoint(i, p));
  const rows = buildPolymarketFeatureRows(points, {
    interval: '1d',
    marketEndTime: '2026-01-05T00:00:00.000Z',
  });

  assert.equal(rows[0].p_vol_7d, 0);
  assert.equal(rows[0].p_zscore_7d, 0);
  closeTo(rows[3].drawdown_from_peak, (0.35 / 0.70) - 1);
  assert.ok(rows[3].p_vol_7d > 0);
  assert.ok(rows[3].p_zscore_7d < 0);
  closeTo(rows[0].elapsed_fraction, 0);
  closeTo(rows[3].elapsed_fraction, 3 / 4);
  closeTo(rows[3].time_to_resolution_hours, 24);
});

test('buildPolymarketFeatureRows applies 1h interval-aware lookbacks', () => {
  const start = Date.parse('2026-02-01T00:00:00.000Z');
  const points = [];
  for (let i = 0; i <= 168; i += 1) {
    const ms = start + i * 60 * 60 * 1000;
    points.push({ t: Math.floor(ms / 1000), iso: new Date(ms).toISOString(), p: 0.10 + i * 0.001 });
  }

  const rows = buildPolymarketFeatureRows(points, { interval: '1h' });
  assert.equal(rows[167].p_momentum_7d, null);
  closeTo(rows[168].p_momentum_7d, 0.168);
});

test('estimatePolymarketExecutionCost adds fee, spread, and square-root impact', () => {
  const small = estimatePolymarketExecutionCost({
    fee: 0.01,
    half_spread_estimate: 0.02,
    Y: 1,
    rolling_volatility: 0.20,
    order_notional: 100,
    rolling_market_volume: 10000,
  });
  const large = estimatePolymarketExecutionCost({
    fee: 0.01,
    half_spread_estimate: 0.02,
    Y: 1,
    rolling_volatility: 0.20,
    order_notional: 400,
    rolling_market_volume: 10000,
  });

  closeTo(small.impact_estimate, 0.02);
  closeTo(small.total_cost, 0.05);
  closeTo(large.impact_estimate, 0.04);
  assert.ok(large.total_cost > small.total_cost);
});

test('estimatePolymarketExecutionCost guards zero volume and zero notional impact', () => {
  const noVolume = estimatePolymarketExecutionCost({
    fee: 0.01,
    half_spread_estimate: 0.02,
    rolling_volatility: 0.20,
    order_notional: 100,
    rolling_market_volume: 0,
  });
  const noNotional = estimatePolymarketExecutionCost({
    fee: 0.01,
    half_spread_estimate: 0.02,
    rolling_volatility: 0.20,
    order_notional: 0,
    rolling_market_volume: 10000,
  });

  assert.equal(noVolume.impact_estimate, 0);
  assert.equal(noNotional.impact_estimate, 0);
  closeTo(noVolume.total_cost, 0.03);
  closeTo(noNotional.total_cost, 0.03);
});

test('estimatePolymarketExecutionCost allows Y zero to disable impact', () => {
  const disabled = estimatePolymarketExecutionCost({
    fee: 0.01,
    half_spread_estimate: 0.02,
    Y: 0,
    rolling_volatility: 0.20,
    order_notional: 100,
    rolling_market_volume: 10000,
  });

  assert.equal(disabled.impact_estimate, 0);
  closeTo(disabled.total_cost, 0.03);
});
