'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runBenchmark, formatBenchmarkReport } = require('../helpers/benchmark_runner.js');
const { getRandomSymbols, DEFAULT_TS_DIR } = require('../helpers/symbol_sampler.js');
const { readTsIndex } = require('../../../shared/lib/market/ts_index_storage.js');

test('benchmark Float64 binary time-series reader throughput across 30 random symbols', async () => {
  const sampledSymbols = getRandomSymbols(30, { timeframe: '1d' });
  assert.ok(sampledSymbols.length >= 30, 'expected at least 30 sampled symbols');

  const result = await runBenchmark(
    'Float64 Binary TS Reader (30 random symbols)',
    { warmupRuns: 5, iterations: 20, itemsPerIteration: sampledSymbols.length },
    () => {
      let totalRecords = 0;
      for (const symbol of sampledSymbols) {
        const records = readTsIndex(DEFAULT_TS_DIR, symbol, '1d');
        if (records) totalRecords += records.length;
      }
      return totalRecords;
    }
  );

  assert.ok(result.opsPerSec > 0);
  assert.ok(result.latency.p50Ms >= 0);
  console.log(`[SAMPLING] Sampled ${sampledSymbols.length} symbols: ${sampledSymbols.slice(0, 5).join(', ')}...`);
  console.log(formatBenchmarkReport([result]));
});
