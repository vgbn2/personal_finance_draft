const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { runBenchmark } = require('../helpers/benchmark_runner');
const { findBackendBinary, STORAGE_TS_DIR } = require('../../../shared/lib/runtime/paths');
const { runBackend } = require('../../../backend/api/server/services/cli_executor_cache');

describe('C++ Native Core Grid Optimizer Benchmark', () => {
  it('benchmarks native C++ binary grid optimization speed over Float64 time-series', () => {
    const binary = findBackendBinary();
    assert.ok(binary, 'sovereign_wealth C++ binary must exist');

    const testBin = path.join(STORAGE_TS_DIR, 'AAPL_1d.bin');
    assert.ok(fs.existsSync(testBin), 'AAPL_1d.bin binary time-series file must exist for benchmark');

    const result = runBenchmark('cpp_grid_optimizer', () => {
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
    }, { iterations: 10, warmup: 2 });

    assert.ok(result.stats.p50_ms < 500, `C++ optimization p50 (${result.stats.p50_ms}ms) must be < 500ms`);
  });
});
