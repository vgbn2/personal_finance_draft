const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { renderEquityCurveChart } = require('../../shared/lib/backtest');
const { validateSnapshot } = require('../../shared/lib/market_validation');
const { STRATEGY_GRADE_INDEX_PATH } = require('../../shared/lib/strategy_registry');

const REPO_ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(REPO_ROOT, 'backend', 'cli', 'sovereign_cli.js');
const { buildStrategyPlan, inspectStrategyFile } = require('../../backend/cli/commands/strategy');
const { buildOptimizationGrid } = require('../../backend/cli/commands/research');

test('market validation rejects impossible crypto history and lower-timeframe synthetic bars', () => {
  const { report, usableSources } = validateSnapshot({
    mode: 'provider_history',
    fetched_at: '2026-05-31T00:00:00.000Z',
    sources: [
      {
        family: 'crypto',
        provider: 'binance',
        symbol: 'BTCUSDT',
        timeframe: '1d',
        timestamp: '1997-05-23T00:00:00.000Z',
        open: 1,
        high: 2,
        low: 1,
        close: 1.5,
        volume: 10,
        source: 'binance-rollup',
      },
      {
        family: 'crypto',
        provider: 'binance',
        symbol: 'ETHUSDT',
        timeframe: '1h',
        timestamp: '2024-01-01T00:00:00.000Z',
        open: 1,
        high: 2,
        low: 1,
        close: 1.5,
        volume: 10,
        source: 'synthetic-deconstructed',
      },
      {
        family: 'equities',
        provider: 'twelve',
        symbol: 'SPY',
        timeframe: '5m',
        timestamp: '2024-01-01T00:00:00.000Z',
        open: 470,
        high: 472,
        low: 468,
        close: 471,
        volume: 1000,
        source: 'twelve-rollup-from-1d',
        derived_from_timeframe: '1d',
      },
      {
        family: 'equities',
        provider: 'twelve',
        symbol: 'SPY',
        timeframe: '1d',
        timestamp: '2024-01-01T00:00:00.000Z',
        open: 470,
        high: 472,
        low: 468,
        close: 471,
        volume: 1000,
        source: 'twelve-1d-history',
      },
    ],
  });

  assert.equal(report.ok, false);
  assert.equal(report.rejected_records, 3);
  assert.equal(usableSources.length, 1);
  assert.equal(usableSources[0].symbol, 'SPY');
  assert.ok(report.issues.some((issue) => issue.code === 'before_family_inception'));
  assert.ok(report.issues.some((issue) => issue.code === 'before_provider_history'));
  assert.ok(report.issues.some((issue) => issue.code === 'synthetic_lower_timeframe'));
});

test('market validation stores native sub-daily-sourced 5m but rejects untagged 5m rollups', () => {
  const { report, usableSources } = validateSnapshot({
    mode: 'provider_history',
    fetched_at: '2026-06-13T00:00:00.000Z',
    sources: [
      {
        // Native Yahoo 5m: aggregateCandles identity passthrough tags the base
        // timeframe as 5m. Must remain storable (rollup label + sub-daily provenance).
        family: 'commodities', provider: 'yahoo', symbol: 'XAUUSD', timeframe: '5m',
        timestamp: '2026-05-01T13:30:00.000Z', open: 2300, high: 2305, low: 2298, close: 2302,
        volume: 0, source: 'yahoo-rollup-from-5m', derived_from_timeframe: '5m',
      },
      {
        // Legacy untagged 5m rollup (no sub-daily provenance) stays rejected.
        family: 'indices', provider: 'twelve', symbol: 'SPX', timeframe: '5m',
        timestamp: '2026-05-01T13:30:00.000Z', open: 5000, high: 5010, low: 4995, close: 5005,
        volume: 0, source: 'twelve-rollup',
      },
    ],
  });

  assert.equal(report.rejected_records, 1);
  assert.equal(usableSources.length, 1);
  assert.equal(usableSources[0].symbol, 'XAUUSD');
  assert.ok(report.issues.some((i) => i.code === 'synthetic_lower_timeframe' && i.family === 'indices'));
});

test('cache-clean quarantines rejected cache records and keeps usable history', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-cache-clean-'));
  const cryptoDir = path.join(tempRoot, 'crypto');
  fs.mkdirSync(cryptoDir, { recursive: true });
  const historyPath = path.join(cryptoDir, 'backtest_history.json');
  fs.writeFileSync(historyPath, JSON.stringify({
    mode: 'backtest_history',
    fetched_at: '2026-05-31T00:00:00.000Z',
    sources: [
      {
        family: 'crypto',
        provider: 'binance',
        symbol: 'BTCUSDT',
        timeframe: '1d',
        timestamp: '1997-05-23T00:00:00.000Z',
        open: 1,
        high: 2,
        low: 1,
        close: 1.5,
        volume: 10,
        source: 'binance-rollup',
      },
      {
        family: 'crypto',
        provider: 'binance',
        symbol: 'BTCUSDT',
        timeframe: '1d',
        timestamp: '2024-01-01T00:00:00.000Z',
        open: 42000,
        high: 43000,
        low: 41000,
        close: 42500,
        volume: 100,
        source: 'binance-1d-history',
      },
    ],
    errors: [],
  }, null, 2));

  const result = spawnSync(process.execPath, [
    CLI,
    'cache-clean',
    '--input',
    tempRoot,
    '--json',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.rejected_records, 1);
  assert.equal(payload.files_cleaned, 1);
  assert.equal(payload.quarantine_files.length, 1);

  const cleaned = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  assert.equal(cleaned.sources.length, 1);
  assert.equal(cleaned.sources[0].timestamp, '2024-01-01T00:00:00.000Z');

  const quarantine = JSON.parse(fs.readFileSync(payload.quarantine_files[0], 'utf8'));
  assert.equal(quarantine.sources.length, 1);
  assert.equal(quarantine.sources[0].timestamp, '1997-05-23T00:00:00.000Z');
});

test('TUI manifest exposes registered strategies as select options', () => {
  const manifest = require('../../backend/cli/tui/manifest');
  const { getRegisteredStrategies } = manifest;
  const options = getRegisteredStrategies();

  assert.ok(options.length >= 1);
  assert.ok(options.some((option) => option.value === 'config/strategies/mean_reversion.yaml'));
});

test('TUI backtest exposes a history window field for longer runs', () => {
  const manifest = require('../../backend/cli/tui/manifest');
  const backtest = manifest.commands.research.find((command) => command.id === 'bt');

  assert.ok(backtest);
  assert.equal(backtest.flags['--days'].type, 'text');
  assert.equal(backtest.flags['--days'].default, '730');
  assert.ok(!backtest.flags['--sample'], '--sample field should not exist in TUI manifest');
});

test('backtest uses strategy YAML defaults unless CLI flags override them', () => {
  const result = spawnSync(process.execPath, [
    CLI,
    'bt',
    '--strategy',
    'config/strategies/mean_reversion.yaml',
    '--allow-degraded',
    '--json',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.strategy, 'mean_reversion');
  assert.equal(payload.strategy_source, 'config/strategies/mean_reversion.yaml');
  assert.equal(payload.strategy_family, 'mean_reversion');
  assert.equal(payload.strategy_lane, 'single_asset');
  assert.equal(payload.strategy_role, 'strategy');
  assert.deepEqual(payload.strategy_universe, ['BTCUSDT', 'SPY']);
  assert.equal(payload.strategy_asset_mode, 'multi_asset_strategy');
  assert.equal(payload.threshold, 0.65);

  const gradeIndex = JSON.parse(fs.readFileSync(STRATEGY_GRADE_INDEX_PATH, 'utf8'));
  const gradeRecord = gradeIndex.strategies['config/strategies/mean_reversion.yaml'];
  assert.ok(gradeRecord, 'expected backtest grade index entry for mean_reversion');
  assert.equal(gradeRecord.family, 'mean_reversion');
  assert.equal(gradeRecord.lane, 'single_asset');
  assert.ok(['A', 'B', 'C', 'D', 'F'].includes(gradeRecord.grade));
  assert.ok(Object.prototype.hasOwnProperty.call(gradeRecord, 'time_weighted_variance'));
  assert.ok(Object.prototype.hasOwnProperty.call(gradeRecord, 'prop_firm_score'));
  assert.ok(Object.prototype.hasOwnProperty.call(gradeRecord, 'prop_firm_verdict'));

  const override = spawnSync(process.execPath, [
    CLI,
    'bt',
    '--strategy',
    'config/strategies/mean_reversion.yaml',
    '--symbol',
    'SPY',
    '--threshold',
    '0.9',
    '--model',
    'xgboost_ranker_v0',
    '--allow-degraded',
    '--json',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(override.status, 0, override.stderr || override.stdout);
  const overridden = JSON.parse(override.stdout);

  assert.deepEqual(overridden.strategy_universe, ['SPY']);
  assert.equal(overridden.strategy_asset_mode, 'multi_asset_strategy');
  assert.equal(overridden.model, 'xgboost_ranker_v0');
  assert.equal(overridden.threshold, 0.9);
  assert.ok(Object.prototype.hasOwnProperty.call(payload, 'time_weighted_variance'));
  assert.ok(Object.prototype.hasOwnProperty.call(payload, 'time_weighted_stddev'));
  assert.ok(Object.prototype.hasOwnProperty.call(payload, 'prop_firm_suitability'));
  assert.ok(payload.prop_firm_suitability && typeof payload.prop_firm_suitability.score === 'number');
});

test('backtest accepts bare registered strategy filenames', () => {
  const result = spawnSync(process.execPath, [
    CLI,
    'bt',
    '--strategy',
    'mean_reversion.yaml',
    '--sample',
    '--allow-degraded',
    '--json',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.strategy, 'mean_reversion');
  assert.equal(payload.strategy_source, 'config/strategies/mean_reversion.yaml');
  assert.deepEqual(payload.strategy_universe, ['BTCUSDT', 'SPY']);
});

test('strategy files expose indicator presets and optimize respects disabled indicator dimensions', () => {
  const strategy = inspectStrategyFile('config/strategies/trend_following.yaml');

  assert.equal(strategy.ok, true);
  assert.equal(strategy.family, 'ml');
  assert.equal(strategy.lane, 'single_asset');
  assert.equal(strategy.role, 'strategy');
  assert.equal(strategy.indicators.rsi, true);
  assert.equal(strategy.indicator_periods.rsi, 7);

  const crossAssetStrategy = inspectStrategyFile('config/strategies/ml_multi_asset.yaml');
  assert.equal(crossAssetStrategy.family, 'ml');
  assert.equal(crossAssetStrategy.lane, 'cross_asset');
  assert.equal(crossAssetStrategy.role, 'portfolio_optimization');

  const customStrategy = {
    indicators: {
      return_fast: true,
      return_slow: true,
      volatility: false,
      rsi: true,
      atr: true,
      bollinger: true,
    },
    indicator_periods: {
      return_fast: 1,
      return_slow: 5,
      volatility: 20,
      rsi: 14,
      atr: 14,
      bollinger: 20,
    },
  };
  const { grid, basePeriods } = buildOptimizationGrid(customStrategy, ['--timeframe', '1d']);

  assert.equal(basePeriods.returnFast, 1);
  assert.equal(grid.length, 27);
  assert.equal(new Set(grid.map((row) => row.volatility)).size, 1);
  assert.equal(new Set(grid.map((row) => row.rsi)).size, 3);
});

test('strategy generation and inspection preserve timeframe metadata', () => {
  const payload = buildStrategyPlan('automation_timeframe_check', {
    kind: 'ml',
    timeframe: '15m',
    features: {
      technical: ['return_fast', 'rsi'],
      relative: ['pair_spread'],
      orderflow: ['imbalance'],
      custom: ['kalman_stddev'],
    },
  });
  assert.match(payload, /^timeframe:\s+15m$/m);
  assert.match(payload, /^family:\s+ml$/m);
  assert.match(payload, /^lane:\s+single_asset$/m);
  assert.match(payload, /^role:\s+strategy$/m);
  assert.match(payload, /^  features:\s*$/m);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-strategy-'));
  const tempPath = path.join(tempDir, 'automation_timeframe_check.yaml');
  fs.writeFileSync(tempPath, payload, 'utf8');

  const inspected = inspectStrategyFile(tempPath);
  assert.equal(inspected.timeframe, '15m');
  assert.deepEqual(inspected.features.technical, ['return_fast', 'rsi']);
  assert.deepEqual(inspected.features.relative, ['pair_spread']);
  assert.deepEqual(inspected.features.orderflow, ['imbalance']);
  assert.deepEqual(inspected.features.custom, ['kalman_stddev']);
  assert.equal(inspected.ok, true);
});

test('backtest human output renders as a sectioned terminal report', () => {
  const result = spawnSync(process.execPath, [
    CLI,
    'bt',
    '--strategy',
    'config/strategies/trend_following.yaml',
    '--sample',
    '--allow-degraded',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Backtest Summary/);
  assert.match(result.stdout, /Backtest Metrics/);
  assert.match(result.stdout, /Risk/);
  assert.match(result.stdout, /Out Of Sample/);
  assert.match(result.stdout, /Universe\s+SPY, QQQ/);
  assert.match(result.stdout, /Runtime\s+\d+ ms/);
  assert.match(result.stdout, /Annualized\s+\d/);
  assert.match(result.stdout, /Backtest Panel/);
  assert.match(result.stdout, /Backtest Return Tape/);
  assert.match(result.stdout, /Out Of Sample Panel/);
  assert.match(result.stdout, /OOS Return Tape/);
  assert.match(result.stdout, /Stress Test/);
  assert.match(result.stdout, /Out Of Sample/);
  assert.match(result.stdout, /Window\s+\d{4}-\d{2}-\d{2}/);
  assert.match(result.stdout, /Data Hygiene/);
  assert.match(result.stdout, /Reliability/);
  assert.match(result.stdout, /Trust Gate/);
  assert.match(result.stdout, /Benchmark/);
  assert.match(result.stdout, /Stress Shape/);
  assert.doesNotMatch(result.stdout, /^strategy_universe:/m);
  assert.doesNotMatch(result.stdout, /^period:\s*\{/m);
});

test('backtest always uses live data and reports a live-mode note', () => {
  const result = spawnSync(process.execPath, [
    CLI,
    'bt',
    '--strategy',
    'config/strategies/defensive_rotation.yaml',
    '--timeframe',
    '1h',
    '--allow-degraded',
    '--json',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);

  assert.ok(payload.notes.length === 1 && payload.notes[0].startsWith('Live data mode'), `Expected live mode note, got: ${payload.notes[0]}`);
  assert.ok(Object.prototype.hasOwnProperty.call(payload, 'annualized_return'));
  assert.ok(Object.prototype.hasOwnProperty.call(payload, 'oos_start_at'));
  assert.ok(Object.prototype.hasOwnProperty.call(payload, 'trust_assessment'));
  assert.ok(['A', 'B', 'C', 'D', 'F'].includes(payload.trust_assessment.grade));
  assert.ok(Object.prototype.hasOwnProperty.call(payload, 'benchmarks'));
  assert.ok(Object.prototype.hasOwnProperty.call(payload.benchmarks, 'buy_hold_equal_weight'));
  assert.ok(Object.prototype.hasOwnProperty.call(payload, 'oos_benchmarks'));
  assert.ok(Object.prototype.hasOwnProperty.call(payload, 'stress_test'));
  assert.equal(typeof payload.stress_test, 'object');
});

test('sample backtest uses generated bars and ignores history window', () => {
  const result = spawnSync(process.execPath, [
    CLI,
    'bt',
    '--strategy',
    'config/strategies/defensive_rotation.yaml',
    '--timeframe',
    '1h',
    '--days',
    '730',
    '--sample',
    '--allow-degraded',
    '--json',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);

  assert.ok(payload.notes.length === 1 && payload.notes[0].startsWith('Sample mode'), `Expected sample mode note, got: ${payload.notes[0]}`);
  assert.equal(payload.source_mode, 'sample');
  assert.ok(payload.data_bars > 0);
  assert.ok(payload.data_bars < 1000, `Expected compact generated sample, got ${payload.data_bars} bars`);
});

test('equity curve chart can compare multiple strategies', () => {
  const chart = renderEquityCurveChart([
    {
      label: 'defensive_rotation',
      points: [
        { timestamp: '2025-01-01T00:00:00.000Z', equity: 1.0 },
        { timestamp: '2025-01-02T00:00:00.000Z', equity: 1.1 },
        { timestamp: '2025-01-03T00:00:00.000Z', equity: 1.3 },
      ],
    },
    {
      label: 'trend_following',
      points: [
        { timestamp: '2025-01-01T00:00:00.000Z', equity: 1.0 },
        { timestamp: '2025-01-02T00:00:00.000Z', equity: 0.95 },
        { timestamp: '2025-01-03T00:00:00.000Z', equity: 1.05 },
      ],
    },
  ], { width: 24, height: 8 });

  assert.match(chart, /Equity Curve/);
  assert.match(chart, /Legend:/);
  assert.match(chart, /defensive_rotation/);
  assert.match(chart, /trend_following/);
});

test('--days restricts the backtest window to the requested number of days', () => {
  // Test the window-computation logic directly — no live data or CLI spawn needed.
  // The invariant: historicalWindowFromArgs(['--days', 'N']) returns a startTs
  // that is approximately N days before now, preventing regression of the Session 50
  // fix (bt --days 30 was using the full 9-year cache before).
  const { historicalWindowFromArgs } = require('../../backend/cli/commands/research');
  const now = Math.floor(Date.now() / 1000);

  const window14 = historicalWindowFromArgs(['--days', '14']);
  assert.equal(window14.days, 14, 'days field should match --days argument');
  const elapsed14 = now - window14.startTs;
  assert.ok(
    Math.abs(elapsed14 - 14 * 86400) <= 5,
    `startTs should be ~14 days before now, got delta=${elapsed14}s`
  );

  const window30 = historicalWindowFromArgs(['--days', '30']);
  assert.equal(window30.days, 30);
  assert.ok(window30.startTs < window14.startTs, 'longer --days should yield an earlier startTs');
});

test('live backtest includes rolling walk-forward result', () => {
  const { rollingWalkForward, runBacktest } = require('../../shared/lib/backtest');
  const { calculateRollingFeatureFrame } = require('../../shared/lib/indicators');

  const now = Date.now();
  const bars = [];
  for (let i = 0; i < 60; i += 1) {
    const t = new Date(now - (60 - i) * 86400_000).toISOString();
    bars.push({ family: 'equities', symbol: 'SPY', timeframe: '1d', timestamp: t, open: 100, high: 102, low: 99, close: 100 + i * 0.1, volume: 1000 });
  }
  const frame = calculateRollingFeatureFrame(bars, 2);
  const wf = rollingWalkForward(frame, runBacktest, { folds: 2, backtestOptions: { threshold: 0.5, horizon: 3 } });

  assert.equal(wf.ok, true, `walk-forward failed: ${wf.reason}`);
  assert.ok(wf.folds_run >= 1, 'expected at least 1 fold');
  assert.ok(wf.aggregate, 'aggregate should be present');
  assert.ok(Object.prototype.hasOwnProperty.call(wf.aggregate, 'mean_oos_return'));
  assert.ok(Object.prototype.hasOwnProperty.call(wf.aggregate, 'positive_oos_rate'));
  assert.ok(Array.isArray(wf.folds) && wf.folds.length > 0);
  assert.ok(!Object.prototype.hasOwnProperty.call(wf.folds[0], 'equity_curve'));
  assert.ok(!Object.prototype.hasOwnProperty.call(wf.folds[0], 'trade_logs'));
  assert.ok(!Object.prototype.hasOwnProperty.call(wf.folds[0].in_sample, 'equity_curve'));
  assert.ok(!Object.prototype.hasOwnProperty.call(wf.folds[0].out_of_sample, 'trade_logs'));
});

test('auto backtest uses the local C++ backend when available', { skip: !require('../../shared/lib/backend_bridge').backendAvailable() }, () => {
  const { runBacktest } = require('../../shared/lib/backtest');
  const { calculateRollingFeatureFrame } = require('../../shared/lib/indicators');

  const now = Date.now();
  const bars = [];
  for (let i = 0; i < 90; i += 1) {
    const t = new Date(now - (90 - i) * 86400_000).toISOString();
    bars.push({
      family: 'equities',
      symbol: 'SPY',
      timeframe: '1d',
      timestamp: t,
      open: 100 + i * 0.1,
      high: 102 + i * 0.1,
      low: 99 + i * 0.1,
      close: 100 + i * 0.2,
      volume: 1000 + i,
    });
  }

  const frame = calculateRollingFeatureFrame(bars, 2);
  // js_model routes through C++ frame mode using JS annotations on the synthetic data,
  // avoiding a dependency on the live data cache which makes native mode non-deterministic.
  const result = runBacktest(frame, { threshold: 0.5, horizon: 3, monteCarloRuns: 20, engine: 'js_model' });

  assert.match(String(result.engine), /cpp|sovereign/i);
  assert.ok(Array.isArray(result.equity_curve) && result.equity_curve.length > 0);
  assert.equal(result.metrics.monte_carlo.runs, 20);
});

test('monte carlo stress keeps retained paths sparse', () => {
  const { runBacktest } = require('../../shared/lib/backtest');
  const { calculateRollingFeatureFrame } = require('../../shared/lib/indicators');

  const now = Date.now();
  const bars = [];
  for (let i = 0; i < 160; i += 1) {
    const t = new Date(now - (160 - i) * 86400_000).toISOString();
    bars.push({ family: 'equities', symbol: 'SPY', timeframe: '1d', timestamp: t, open: 100, high: 102, low: 99, close: 100 + i * 0.2, volume: 1000 });
  }
  const frame = calculateRollingFeatureFrame(bars, 2);
  // js_model uses C++ frame mode with JS-annotated predictions; deterministic with synthetic data.
  const result = runBacktest(frame, { threshold: 0.5, horizon: 3, monteCarloRuns: 200, engine: 'js_model' });

  assert.equal(result.metrics.monte_carlo.runs, 200);
  assert.ok(result.metrics.monte_carlo.worst_path.equity_curve.length <= 50);
  assert.ok(result.metrics.monte_carlo.median_path.equity_curve.length <= 50);
});

test('snapshot reader can load one family from history directories', () => {
  const { readSnapshot } = require('../../shared/lib/market_validation');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-snapshot-family-'));
  const cryptoDir = path.join(root, 'crypto');
  const equitiesDir = path.join(root, 'equities');
  fs.mkdirSync(cryptoDir, { recursive: true });
  fs.mkdirSync(equitiesDir, { recursive: true });
  fs.writeFileSync(path.join(cryptoDir, 'backtest_history.json'), JSON.stringify({
    fetched_at: '2026-06-01T00:00:00.000Z',
    sources: [{ family: 'crypto', symbol: 'BTCUSDT', timestamp: '2026-06-01T00:00:00.000Z', close: 100 }],
  }));
  fs.writeFileSync(path.join(equitiesDir, 'backtest_history.json'), JSON.stringify({
    fetched_at: '2026-06-01T00:00:00.000Z',
    sources: [{ family: 'equities', symbol: 'SPY', timestamp: '2026-06-01T00:00:00.000Z', close: 500 }],
  }));

  const scoped = readSnapshot(root, { family: 'crypto' });
  const merged = readSnapshot(root);

  assert.equal(scoped.loaded_family, 'crypto');
  assert.equal(scoped.sources.length, 1);
  assert.equal(scoped.sources[0].symbol, 'BTCUSDT');
  assert.equal(merged.sources.length, 2);
});
