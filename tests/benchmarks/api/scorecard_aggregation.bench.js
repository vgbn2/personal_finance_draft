'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runBenchmark, formatBenchmarkReport } = require('../helpers/benchmark_runner.js');
const { getRandomSymbols } = require('../helpers/symbol_sampler.js');
const { projectSignalCandidates } = require('../../../backend/api/server/services/cli_executor_signals.js');

test('benchmark scorecard signal candidate projection across 30 random symbols', async () => {
  const sampledSymbols = getRandomSymbols(30);
  assert.ok(sampledSymbols.length >= 30, 'expected at least 30 sampled symbols');

  const families = ['equities', 'crypto', 'indices', 'commodities', 'fx'];
  const perSymbol = sampledSymbols.map((symbol, idx) => ({
    symbol,
    family: families[idx % families.length],
    winner: 'xgboost_v1',
    candidates: [
      {
        model: 'xgboost_v1',
        sharpe_like: 1.0 + (idx % 5) * 0.1,
        total_return: 0.1 + (idx % 5) * 0.02,
        hit_rate: 0.55 + (idx % 5) * 0.01,
      },
    ],
  }));

  const mockReports = {
    model: { generated_at: new Date().toISOString(), source_mode: 'provider_history' },
  };

  const mockRequest = { threshold: 0.5 };
  const mockFreshness = { fresh: true, validUntil: new Date(Date.now() + 86400000).toISOString() };

  const result = await runBenchmark(
    'Scorecard Signal Candidate Projection (30 symbols)',
    { warmupRuns: 50, iterations: 500, itemsPerIteration: sampledSymbols.length },
    () => {
      const candidates = projectSignalCandidates(perSymbol, mockReports, mockRequest, mockFreshness);
      return candidates ? candidates.length : 0;
    }
  );

  assert.ok(result.opsPerSec > 0);
  console.log(`[SAMPLING] Scorecard projected signal candidates for ${sampledSymbols.length} sampled symbols`);
  console.log(formatBenchmarkReport([result]));
});
