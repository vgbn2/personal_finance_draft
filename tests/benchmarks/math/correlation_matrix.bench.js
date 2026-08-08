'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runBenchmark, formatBenchmarkReport } = require('../helpers/benchmark_runner.js');
const { pearsonCorrelation } = require('../../../backend/api/server/services/cli_executor_market.js');

function generateReturnSeries(length, seedOffset) {
  const series = [];
  for (let i = 0; i < length; i += 1) {
    series.push(Math.sin(i * 0.1 + seedOffset) + (i % 3 === 0 ? 0.1 : -0.1));
  }
  return series;
}

test('benchmark 47x47 asset pair Pearson correlation calculations', async () => {
  const assetsCount = 47;
  const seriesLength = 500;
  const assetSeries = [];
  for (let i = 0; i < assetsCount; i += 1) {
    assetSeries.push(generateReturnSeries(seriesLength, i));
  }

  const uniquePairs = (assetsCount * (assetsCount - 1)) / 2; // 1,081 pairs

  const result = await runBenchmark(
    'Pearson Matrix (47x47 assets, 1081 pairs)',
    { warmupRuns: 10, iterations: 50, itemsPerIteration: uniquePairs },
    () => {
      let sumCorr = 0;
      for (let i = 0; i < assetsCount; i += 1) {
        for (let j = i + 1; j < assetsCount; j += 1) {
          sumCorr += pearsonCorrelation(assetSeries[i], assetSeries[j]);
        }
      }
      return sumCorr;
    }
  );

  assert.ok(result.opsPerSec > 0);
  console.log(formatBenchmarkReport([result]));
});
