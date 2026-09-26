'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CATALOG_ENTRIES,
  getCatalogFixture,
  getFlashCrashBtc,
  getFlatlineWeekendEurUsd,
  getIlliquidToken,
  getPartialFillEcnOrders,
} = require('../../../../tests/fixtures/catalog/index.js');

test('Fixture Catalog: Flash crash BTC fixture loads valid OHLCV series', () => {
  const fixture = getFlashCrashBtc();
  assert.strictEqual(fixture.symbol, 'BTCUSDT');
  assert.strictEqual(fixture.timeframe, '5m');
  assert.strictEqual(fixture.anomaly_type, 'flash_crash');
  assert.ok(Array.isArray(fixture.sources), 'sources must be an array');
  assert.strictEqual(fixture.sources.length, 500);

  // Assert price continuity & fields
  for (const bar of fixture.sources) {
    assert.strictEqual(bar.symbol, 'BTCUSDT');
    assert.strictEqual(bar.timeframe, '5m');
    assert.ok(Number.isFinite(bar.open));
    assert.ok(Number.isFinite(bar.high));
    assert.ok(Number.isFinite(bar.low));
    assert.ok(Number.isFinite(bar.close));
    assert.ok(Number.isFinite(bar.volume));
    assert.ok(bar.high >= bar.low, 'High must be >= Low');
  }
});

test('Fixture Catalog: Flatline weekend EURUSD fixture loads valid zero-volatility gap', () => {
  const fixture = getFlatlineWeekendEurUsd();
  assert.strictEqual(fixture.symbol, 'EURUSD');
  assert.strictEqual(fixture.timeframe, '1h');
  assert.ok(fixture.sources.length >= 100);

  const weekendBars = fixture.sources.filter((b) => b.volume === 0);
  assert.ok(weekendBars.length > 0, 'Must have zero-volume weekend bars');
});

test('Fixture Catalog: Illiquid token fixture loads valid stepped prices', () => {
  const fixture = getIlliquidToken();
  assert.strictEqual(fixture.symbol, 'ILLIQUSDT');
  assert.ok(fixture.sources.length >= 50);
});

test('Fixture Catalog: ECN partial fill fixture loads orders', () => {
  const fixture = getPartialFillEcnOrders();
  assert.ok(Array.isArray(fixture.orders), 'orders must be an array');
  assert.ok(fixture.orders.length >= 3);
  const partial = fixture.orders.find((o) => o.status === 'partially_filled');
  assert.ok(partial, 'Must have a partially_filled order');
  assert.strictEqual(partial.symbol, 'BTCUSDT');
});
