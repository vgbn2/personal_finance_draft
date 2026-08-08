'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runBenchmark, formatBenchmarkReport } = require('../helpers/benchmark_runner.js');
const { modelCandidates } = require('../../../shared/lib/ml/models.js');

function generateFeatureVector(seed) {
  return {
    close: 150,
    return_fast: Math.sin(seed * 0.1),
    return_slow: Math.cos(seed * 0.1),
    volatility: 0.02 + (seed % 5) * 0.005,
    rsi: 30 + (seed % 40),
    atr: 1.5 + (seed % 3),
    bollinger_upper: 105,
    bollinger_lower: 95,
  };
}

test('benchmark ONNX and heuristic ML candidate prediction latency', async () => {
  const sampleVector = generateFeatureVector(10);
  const model = modelCandidates[0];

  const result = await runBenchmark(
    'ML Feature Vector Prediction',
    { warmupRuns: 100, iterations: 1000, itemsPerIteration: 10 },
    () => {
      let count = 0;
      for (let i = 0; i < 10; i += 1) {
        const pred = model.predict(sampleVector);
        if (pred) count += 1;
      }
      return count;
    }
  );

  assert.ok(result.opsPerSec > 0);
  console.log(formatBenchmarkReport([result]));
});
