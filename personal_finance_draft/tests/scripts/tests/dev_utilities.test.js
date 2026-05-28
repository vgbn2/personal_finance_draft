const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { categoryFor } = require('../dev/organize_test_fixture_outputs');
const { FIXTURE_PATH } = require('../dev/refresh_real_bars_fixture');
const { probeParallelBackfill } = require('../dev/parallel_backfill_probe');
const { compareModelRegistries } = require('../dev/model_registry_parity');

test('development utilities expose safe paths and fixture categories', () => {
  assert.equal(categoryFor('validator_rejects_bad_ohlc.json'), 'validation');
  assert.equal(categoryFor('backend_integrity_summary.json'), 'backend');
  assert.equal(categoryFor('quote_router_sample.json'), 'ingestion_and_quotes');
  assert.equal(categoryFor('model_comparison_output.json'), 'ml_and_backtest');
  assert.equal(categoryFor('other_visibility.json'), 'misc');
  assert.equal(FIXTURE_PATH.endsWith(path.join('scripts', 'test', 'fixtures', 'real_bars_btc.json')), true);
});

test('parallel backfill probe supports dependency injection for offline evidence', async () => {
  const result = await probeParallelBackfill({
    symbol: 'BTCUSDT',
    timeframe: '5m',
    days: 1,
    providers: ['binance', 'binance'],
    fetcher: async () => Array.from({ length: 300 }, (_, index) => ({
      timestamp: `2026-05-20T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
    })),
  });

  assert.equal(result.ok, true);
  assert.equal(result.candles, 300);
  assert.equal(result.expected_lower_bound, 230);
  console.log(JSON.stringify({
    type: 'parallel_backfill_probe_contract',
    symbol: result.symbol,
    candles: result.candles,
    expected_lower_bound: result.expected_lower_bound,
  }, null, 2));
});

test('JavaScript and C++ model registries expose the same candidate contract', () => {
  const report = compareModelRegistries();
  assert.equal(report.ok, true);
  assert.equal(report.js_count, 14);
  assert.equal(report.cpp_count, 14);
  assert.deepEqual(report.only_in_js, []);
  assert.deepEqual(report.only_in_cpp, []);
  assert.ok(report.families.includes('boosting'));
  assert.ok(report.families.includes('trees'));
  assert.ok(report.families.includes('neural'));
  console.log(JSON.stringify({
    type: 'model_registry_parity_contract',
    js_count: report.js_count,
    cpp_count: report.cpp_count,
    families: report.families,
  }, null, 2));
});
