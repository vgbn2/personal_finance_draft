const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { categoryFor } = require('../../../../backend/scripts/dev/organize_test_fixture_outputs');
const { FIXTURE_PATH } = require('../../../../backend/scripts/dev/refresh_real_bars_fixture');
const { probeParallelBackfill } = require('../../../../backend/scripts/dev/parallel_backfill_probe');
const { compareModelRegistries } = require('../../../../backend/scripts/dev/model_registry_parity');
const { withLoadingAnimation } = require('../../../../backend/cli/lib/utils');

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

test('loading animation helper renders and clears without waiting for TTY output', async () => {
  const writes = [];
  const stream = {
    write(chunk) {
      writes.push(String(chunk));
      return true;
    },
  };

  const result = await withLoadingAnimation(
    'Running backtest',
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return 42;
    },
    [],
    { enabled: true, stream, intervalMs: 5, frames: ['|', '/', '-'] }
  );

  assert.equal(result, 42);
  assert.ok(writes.some((chunk) => chunk.includes('Running backtest')));
  assert.ok(writes.some((chunk) => chunk.includes('/') || chunk.includes('-')));
  assert.equal(writes.at(-1), '\r\x1b[2K');
});
