const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { historicalTailRisk, monteCarloStress, runBacktest } = require('../../../shared/lib/backtest');
const {
  calculateDivergenceSignals,
  calculateRollingFeatureFrame,
  calculateSmartMoneyConceptSignals,
  calculateSessionVolumeProfile,
  generateSampleBars,
  rsi,
} = require('../../../shared/lib/indicators');
const { compareModels, modelCandidates } = require('../../../shared/lib/models');

function dumpVisibility(name, data) {
  const dir = process.env.SOVEREIGN_TEST_OUTPUT_DIR ||
    path.join(os.tmpdir(), 'sovereign-test-outputs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  fs.writeFileSync(path.join(dir, safeName + '.json'), JSON.stringify(data, (key, val) => {
    if (typeof val === 'number' && !Number.isInteger(val)) return Number(val.toFixed(3));
    return val;
  }, 2), 'utf8');
}

test('indicators produce rolling feature rows from sample bars', () => {
  const frame = calculateRollingFeatureFrame(generateSampleBars('SPY', 40), 2, { rsi: 7, atr: 7, bollinger: 10 });
  dumpVisibility('indicators produce rolling feature rows from sample bars', { frame });
  assert.equal(frame.feature_count, 39);
  assert.equal(frame.indicator_periods.rsi, 7);
  assert.equal(frame.features.at(-1).symbol, 'SPY');
  assert.equal(typeof frame.features.at(-1).return_fast, 'number');
  assert.equal(typeof rsi(generateSampleBars('SPY', 20).map((bar) => bar.close), 14), 'number');
});

test('price action indicators detect structure breaks and divergence', () => {
  const bars = [
    { open: 100, high: 101, low: 99, close: 100 },
    { open: 98, high: 99, low: 97, close: 98 },
    { open: 98, high: 102, low: 100, close: 101 },
    { open: 97, high: 101, low: 95, close: 96 },
    { open: 96, high: 103, low: 101, close: 102 },
    { open: 102, high: 102.5, low: 94, close: 95 },
    { open: 103, high: 104, low: 102, close: 103 },
    { open: 103, high: 103, low: 102.5, close: 102 },
    { open: 102, high: 109, low: 107, close: 108 },
  ].map((bar, index) => {
    const timestamp = new Date(Date.parse('2025-01-01T00:00:00.000Z') + index * 24 * 60 * 60 * 1000).toISOString();
    return { family: 'equities', symbol: 'SPY', timeframe: '1d', timestamp, ...bar, volume: 1000 + index };
  });

  const smc = calculateSmartMoneyConceptSignals(bars, { structureStrength: 1 });
  const divergence = calculateDivergenceSignals(bars, { structureStrength: 1, rsiPeriod: 3 });
  const frame = calculateRollingFeatureFrame(bars, 2, { structure: 1, divergence: 3 });

  assert.equal(smc.ok, true);
  assert.equal(smc.bias, 'bullish');
  assert.equal(smc.signals.bullish_structure_break, true);
  assert.equal(divergence.ok, true);
  assert.equal(divergence.bullish, true);
  assert.ok(divergence.rsi.bullish || divergence.macd.bullish);
  assert.equal(frame.features.at(-1).smc_bias, 'bullish');
  assert.ok(Number.isFinite(frame.features.at(-1).smc_score));
  assert.ok(Number.isFinite(frame.features.at(-1).divergence_score));
});

test('session volume profile captures intraday value area and poc', () => {
  const closes = [100, 100.4, 100.8, 101.2, 101.6, 102, 102.4, 102.1, 101.8, 102.6, 102.9, 102.7];
  const volumes = [1000, 1100, 1200, 1300, 5000, 5200, 5400, 3000, 2400, 2600, 2200, 2100];
  const bars = closes.map((close, index) => {
    const timestamp = new Date(Date.parse('2025-01-01T14:30:00.000Z') + index * 5 * 60 * 1000).toISOString();
    return {
      family: 'equities', symbol: 'SPY', timeframe: '5m', timestamp,
      open: close - 0.1, high: close + 0.3, low: close - 0.3, close, volume: volumes[index],
    };
  });

  const profile = calculateSessionVolumeProfile(bars, { binCount: 12 });
  const frame = calculateRollingFeatureFrame(bars, 2, { sessionBins: 12, sessionMinimumBars: 5 });

  assert.equal(profile.ok, true);
  assert.ok(Number.isFinite(profile.poc_price));
  assert.ok(profile.value_area_high >= profile.value_area_low);
  assert.ok(profile.position >= 0 && profile.position <= 1);
  assert.equal(frame.features.at(-1).session_volume_profile_session_key, profile.session_key);
  assert.ok(Number.isFinite(frame.features.at(-1).session_volume_profile_vwap));
  assert.ok(Number.isFinite(frame.features.at(-1).session_volume_profile_position));
});

test('model comparison and backtest produce ranked, reproducible outputs', () => {
  const frame = calculateRollingFeatureFrame(generateSampleBars('SPY', 80), 2);
  const comparison = compareModels(frame);
  assert.equal(comparison.models.length, modelCandidates.length);
  assert.ok(comparison.models.length >= 10);
  assert.ok(comparison.families.includes('boosting'));
  assert.ok(comparison.families.includes('trees'));
  assert.ok(comparison.families.includes('neural'));
  assert.ok(comparison.winner);
  assert.equal(comparison.per_symbol_winners[0].symbol, 'SPY');
  assert.ok(comparison.per_symbol_winners[0].winner);
  assert.ok(comparison.models.some((model) => model.name === 'xgboost_ranker_v0'));
  assert.ok(comparison.models.some((model) => model.name === 'decision_tree_stump_v0'));

  const backtest = runBacktest(frame, {
    model: comparison.winner,
    horizon: 5,
    threshold: 0.55,
    costBps: 5,
    feeBps: 2,
    slippageBps: 3,
    tailAlpha: 0.05,
    monteCarloRuns: 150,
    timeframe: '1d',
    engine: 'js',
  });
  dumpVisibility('model comparison and backtest produce ranked, reproducible outputs', { frame, comparison, backtest });
  assert.equal(typeof backtest.metrics.net_return, 'number');
  assert.equal(typeof backtest.metrics.max_drawdown, 'number');
  assert.ok(Object.prototype.hasOwnProperty.call(backtest.metrics, 'sharpe_ratio'));
  assert.ok(Object.prototype.hasOwnProperty.call(backtest.metrics, 'sortino_ratio'));
  assert.ok(Object.prototype.hasOwnProperty.call(backtest.metrics, 'win_rate'));
  assert.ok(Object.prototype.hasOwnProperty.call(backtest.metrics, 'expected_value'));
  assert.ok(Object.prototype.hasOwnProperty.call(backtest.metrics, 'tail_risk'));
  assert.ok(Object.prototype.hasOwnProperty.call(backtest.metrics, 'monte_carlo'));
  assert.equal(Array.isArray(backtest.trade_logs), true);
  assert.equal(backtest.trade_logs[0].provider, 'sample');
  assert.equal(backtest.trade_logs[0].fee_bps, 2);
  assert.equal(backtest.trade_logs[0].slippage_bps, 3);
  assert.equal(backtest.trade_logs[0].holding_period_bars, 5);
  assert.equal(backtest.timeframe, '1d');
  assert.equal(Array.isArray(backtest.trades), true);
});

test('tail risk and monte carlo helpers are deterministic', () => {
  const returns = [0.03, -0.02, 0.01, -0.05, 0.04, -0.01];
  const tailRisk = historicalTailRisk(returns, 0.05);
  const mcA = monteCarloStress(returns, { runs: 120, seed: 'demo' });
  const mcB = monteCarloStress(returns, { runs: 120, seed: 'demo' });
  dumpVisibility('tail risk and monte carlo helpers are deterministic', { tailRisk, mcA, mcB });
  assert.equal(tailRisk.alpha, 0.05);
  assert.ok(Number.isFinite(tailRisk.value_at_risk));
  assert.ok(Number.isFinite(tailRisk.expected_shortfall));
  assert.deepEqual(mcA, mcB);
  assert.equal(mcA.runs, 120);
});
