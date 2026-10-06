const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { runBenchmark } = require('../helpers/benchmark_runner');
const { findBackendBinary, STORAGE_TS_DIR } = require('../../../shared/lib/runtime/paths');
const { runBackend } = require('../../../backend/api/server/services/cli_executor_cache');

describe('C++ Native Core Grid Optimizer Benchmark', () => {
  it('benchmarks native C++ binary grid optimization speed over Float64 time-series', async () => {
    const binary = findBackendBinary();
    assert.ok(binary, 'sovereign_wealth C++ binary must exist');

    const testBin = path.join(STORAGE_TS_DIR, 'AAPL_1d.bin');
    assert.ok(fs.existsSync(testBin), 'AAPL_1d.bin binary time-series file must exist for benchmark');

    const result = await runBenchmark('cpp_grid_optimizer', { iterations: 10, warmupRuns: 2 }, () => {
      const res = runBackend([
        'optimize',
        '--symbols', 'AAPL',
        '--timeframe', '1d',
        '--ts-dir', STORAGE_TS_DIR,
      ]);
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.engine, 'sovereign_cpp_core');
      assert.strictEqual(res.tested, 972);
      assert.ok(res.winner);
    });

    assert.ok(result.latency.p50Ms < 2500, `C++ optimization p50 (${result.latency.p50Ms}ms) must be < 2500ms`);
  });
});
