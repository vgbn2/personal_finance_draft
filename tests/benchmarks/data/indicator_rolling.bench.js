'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runBenchmark, formatBenchmarkReport } = require('../helpers/benchmark_runner.js');
const { getRandomSymbols } = require('../helpers/symbol_sampler.js');
const { calculateRollingFeatureFrame } = require('../../../shared/lib/market/indicators.js');

function generateMultiSymbolCandles(symbols, candlesPerSymbol = 500) {
  const startMs = Date.parse('2020-01-01T00:00:00Z');
  const dayMs = 86400000;
  const allSources = [];

  symbols.forEach((symbol, symIdx) => {
    let price = 100 + symIdx * 5;
    for (let i = 0; i < candlesPerSymbol; i += 1) {
      price += (i % 2 === 0 ? 0.5 : -0.4);
      allSources.push({
        symbol,
        family: 'equities',
        provider: 'synthetic',
        timeframe: '1d',
        timestamp: new Date(startMs + i * dayMs).toISOString(),
        open: price - 0.2,
        high: price + 0.5,
        low: price - 0.5,
        close: price,
        volume: 1000,
      });
    }
  });

  return allSources;
}

test('benchmark rolling indicator calculations across 30 random symbols', async () => {
  const sampledSymbols = getRandomSymbols(30);
  assert.ok(sampledSymbols.length >= 30, 'expected at least 30 sampled symbols');

  const multiSymbolCandles = generateMultiSymbolCandles(sampledSymbols, 300);
  const periods = { returnFast: 1, returnSlow: 5, volatility: 20, rsi: 14, atr: 14, bollinger: 20 };

  const result = await runBenchmark(
    'Rolling Indicators (30 symbols x 300 candles)',
    { warmupRuns: 3, iterations: 10, itemsPerIteration: multiSymbolCandles.length },
    () => {
      const frame = calculateRollingFeatureFrame(multiSymbolCandles, 2, periods);
      return frame.feature_count;
    }
  );

  assert.ok(result.opsPerSec > 0);
  assert.ok(result.throughputPerSec > 0);
  console.log(`[SAMPLING] Sampled ${sampledSymbols.length} symbols across ${multiSymbolCandles.length} total candles`);
  console.log(formatBenchmarkReport([result]));
});
