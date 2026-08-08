'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runBenchmark, formatBenchmarkReport } = require('../helpers/benchmark_runner.js');
const { normalizeSizingIntent } = require('../../../shared/lib/trading/position_sizing.js');

test('benchmark position sizing and risk budget normalization', async () => {
  const result = await runBenchmark(
    'Position Sizing Normalization',
    { warmupRuns: 100, iterations: 1000, itemsPerIteration: 10 },
    () => {
      let validCount = 0;
      for (let i = 0; i < 10; i += 1) {
        const sizing = normalizeSizingIntent({
          mode: 'risk_budget',
          amount: 500,
          referencePrice: 150.5,
          accountEquity: 25000,
          maxPositionNotionalPct: 0.1,
          stepSize: 0.01,
          minQuantity: 0.01,
          stopLossPrice: 145.0,
        });
        if (sizing.ok) validCount += 1;
      }
      return validCount;
    }
  );

  assert.ok(result.opsPerSec > 0);
  console.log(formatBenchmarkReport([result]));
});
