'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runBenchmark, formatBenchmarkReport } = require('../helpers/benchmark_runner.js');
const { getRandomSymbols } = require('../helpers/symbol_sampler.js');
const { calculateRollingFeatureFrame } = require('../../../shared/lib/market/indicators.js');
const { runBacktest } = require('../../../shared/lib/strategy/backtest.js');

function generateMultiSymbolCandles(symbols, count = 200) {
  const startMs = Date.parse('2020-01-01T00:00:00Z');
  const dayMs = 86400000;
  const sources = [];

  symbols.forEach((symbol, symIdx) => {
    let price = 100 + symIdx * 2;
    for (let i = 0; i < count; i += 1) {
      price += (i % 2 === 0 ? 0.8 : -0.6);
      sources.push({
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

  return sources;
}

test('benchmark portfolio backtest execution loop across 30 random symbols', async () => {
  const sampledSymbols = getRandomSymbols(30);
  assert.ok(sampledSymbols.length >= 30, 'expected at least 30 sampled symbols');

  const candles = generateMultiSymbolCandles(sampledSymbols, 200);
  const periods = { returnFast: 1, returnSlow: 5, volatility: 20, rsi: 14, atr: 14, bollinger: 20 };
  const featureFrame = calculateRollingFeatureFrame(candles, 2, periods);

  const backtestOptions = {
    strategy: 'cnn_momentum',
    model: 'cnn_window_v0',
    horizon: 5,
    threshold: 0.55,
    costBps: 5,
    feeBps: 2,
    slippageBps: 3,
    engine: 'js',
  };

  const result = await runBenchmark(
    'Portfolio Backtest (30 symbols x 200 candles)',
    { warmupRuns: 5, iterations: 20, itemsPerIteration: sampledSymbols.length },
    () => {
      const report = runBacktest(featureFrame, backtestOptions);
      return report.metrics.trades;
    }
  );

  assert.ok(result.opsPerSec > 0);
  console.log(`[SAMPLING] Backtested portfolio across ${sampledSymbols.length} sampled symbols`);
  console.log(formatBenchmarkReport([result]));
});
