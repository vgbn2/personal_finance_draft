'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { localStatsFromEquityCsv } = require('../../../backend/api/server/services/cli_executor');
const {
  runBacktest,
  withEngineProvenance,
} = require('../../../shared/lib/strategy/backtest');

test('local statistics expose unavailable annualized metrics instead of authoritative zeros', () => {
  const result = localStatsFromEquityCsv('100,105,102,110');
  assert.equal(result.ok, true);
  assert.equal(result.degraded, true);
  assert.equal(result.annualized_return, null);
  assert.equal(result.sortino, null);
  assert.equal(result.calmar, null);
  assert.deepEqual(result.unavailable_metrics, ['annualized_return', 'sortino', 'calmar']);
});

test('engine provenance marks JS fallback as degraded with a machine-readable reason', () => {
  const result = withEngineProvenance(
    { engine: 'sovereign_js', metrics: {} },
    'cpp_native',
    'native_result_invalid',
  );
  assert.equal(result.engine_requested, 'cpp_native');
  assert.equal(result.engine_actual, 'sovereign_js');
  assert.equal(result.degraded, true);
  assert.equal(result.fallback_reason, 'native_result_invalid');
});

test('an explicitly requested JS backtest is not mislabeled as degraded fallback', () => {
  const sampleFeature = { key: 'AAPL:1d:2026-01-01', symbol: 'AAPL', timeframe: '1d', as_of: '2026-01-01T00:00:00Z', close: 150 };
  const result = runBacktest({ features: [sampleFeature], skipped: [] }, { engine: 'js' });
  assert.equal(result.engine_requested, 'js');
  assert.equal(result.engine_actual, 'sovereign_js');
  assert.equal(result.degraded, false);
  assert.equal(result.fallback_reason, null);
});
