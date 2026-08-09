const path = require('node:path');
const { loadResearchConfig } = require('../../lib/research_config.js');
const utils = require('../../lib/utils.js');
const {
  optionValue,
  numericOption,
  hasFlag,
  printPayload,
  withLoadingAnimation,
  REPO_ROOT,
  DEFAULT_QUALITY_REPORT,
} = utils;
const {
  isRichTerminal,
  promptSelect,
} = require('../../tui/index.js');
const { createProgress } = require('../../tui/progress.js');
const {
  calculateRollingFeatureFrame,
} = require('../../../../shared/lib/market/indicators.js');
const {
  filterFeatureFrame,
  splitFeatureFrame,
  runBacktest,
} = require('../../../../shared/lib/strategy/backtest.js');
const { writeJson } = require('../../../../shared/lib/market/validation.js');
const { loadUsableSources } = require('./research_sources.js');
const { findBackendBinary, STORAGE_TS_DIR } = require('../../../../shared/lib/runtime/paths.js');
const { runBackend } = require('../../../api/server/services/cli_executor_cache.js');

const researchConfig = loadResearchConfig();

function buildOptimizationGrid(strategyMeta, args, periodOptionsFromStrategy, normalizeIndicatorFlags) {
  const gridConfig = researchConfig.optimization_grid || {};
  const basePeriods = periodOptionsFromStrategy(strategyMeta, args);
  const indicatorFlags = normalizeIndicatorFlags(strategyMeta);
  const dimensions = {
    rsi: indicatorFlags.rsi ? (gridConfig.rsi || [7, 14, 21]) : [basePeriods.rsi],
    atr: indicatorFlags.atr ? (gridConfig.atr || [7, 14, 21]) : [basePeriods.atr],
    bollinger: indicatorFlags.bollinger ? (gridConfig.bollinger || [10, 20, 30]) : [basePeriods.bollinger],
    volatility: indicatorFlags.volatility ? (gridConfig.volatility || [10, 20, 60]) : [basePeriods.volatility],
  };
  const grid = [];
  for (const rsi of dimensions.rsi) {
    for (const atr of dimensions.atr) {
      for (const bollinger of dimensions.bollinger) {
        for (const volatility of dimensions.volatility) {
          grid.push({
            ...basePeriods,
            rsi,
            atr,
            bollinger,
            volatility,
            enabled_indicators: indicatorFlags,
          });
        }
      }
    }
  }
  return { grid, basePeriods, indicatorFlags };
}

function renderOptimize(payload) {
  const line = '-'.repeat(72);
  const lines = [`\n=== OPTIMIZATION RESULTS ===`];

  lines.push(`Configurations Tested: ${payload.tested}`);
  lines.push(`Output: ${payload.output}`);

  const toPct = (val) => val != null ? (val * 100).toFixed(2) + '%' : 'N/A';
  const toNum = (val) => val != null ? val.toFixed(3) : 'N/A';

  if (!payload.winner || payload.winner === 'none') {
    lines.push(`\n[WINNER] None found.`);
    lines.push(`\n${line}`);
    return lines.join('\n');
  }

  lines.push(`\n[OPTIMAL CONFIGURATION]`);
  for (const [key, val] of Object.entries(payload.winner)) {
    if (key !== 'enabled_indicators') {
      lines.push(`  ${key}: ${val}`);
    }
  }

  lines.push(`\n[TRAINING METRICS (In-Sample)]`);
  lines.push(`  Net Return:     ${toPct(payload.winner_net_return)}`);
  lines.push(`  Max Drawdown:   ${toPct(payload.winner_max_drawdown)}`);
  lines.push(`  Sharpe Ratio:   ${toNum(payload.winner_sharpe)}`);
  lines.push(`  Sortino Ratio:  ${toNum(payload.winner_sortino)}`);
  lines.push(`  Expected Value: ${toNum(payload.winner_ev)}`);
  lines.push(`  Win Rate:       ${toPct(payload.winner_win_rate)}`);
  lines.push(`  Tail VaR (95%): ${toPct(payload.winner_tail_var_95)}`);
  lines.push(`  Loss Prob (MC): ${toPct(payload.winner_mc_loss_prob)}`);

  lines.push(`\n[TESTING METRICS (Out-Of-Sample)]`);
  lines.push(`  Trades:         ${payload.oos_trades}`);
  lines.push(`  Net Return:     ${toPct(payload.oos_net_return)}`);
  lines.push(`  Expected Value: ${toNum(payload.oos_ev)}`);
  lines.push(`  Overfit Warn:   ${payload.oos_overfit_warning ? 'YES (Severely Degraded)' : 'No'}`);

  lines.push(`\n${line}`);
  return lines.join('\n');
}

async function commandOptimize(args, helpers = {}) {
  const {
    periodOptionsFromStrategy = require('./research.js').periodOptionsFromStrategy,
    normalizeIndicatorFlags = require('./research.js').normalizeIndicatorFlags,
    inferSnapshotFamily = require('./research.js').inferSnapshotFamily,
    backtestDataQualityError = require('./research.js').backtestDataQualityError,
    resolveStrategyPathInput = require('./research.js').resolveStrategyPathInput,
  } = helpers;

  const output = optionValue(args, '--output', path.join(REPO_ROOT, 'data', 'models', 'latest_indicator_optimization.json'));

  let strategyPath = resolveStrategyPathInput(optionValue(args, '--strategy', null));
  let strategyMeta = null;

  if (!strategyPath && isRichTerminal() && !hasFlag(args, '--json')) {
    const { readStrategyRegistry, inspectStrategyFile } = require('../strategy/strategy.js');
    const files = readStrategyRegistry();
    const strategies = files.map(inspectStrategyFile);
    if (strategies.length > 0) {
      console.log(`\n\x1b[1;36mOptimize Indicator Periods\x1b[0m`);
      strategyPath = await promptSelect('Select strategy to optimize:', strategies.map(s => ({
        label: `${s.name} (${s.kind})`,
        value: s.path
      })));
    }
  }

  if (strategyPath) {
    const { inspectStrategyFile } = require('../strategy/strategy.js');
    strategyMeta = inspectStrategyFile(strategyPath);
  }

  // Inject symbols from strategy universe if not explicitly provided
  if (strategyMeta?.universe && strategyMeta.universe.length > 0 && !optionValue(args, '--symbol', null)) {
      console.log(`\x1b[90m[INFO] Using universe from strategy: ${strategyMeta.universe.join(', ')}\x1b[0m`);
      args = [...args, '--symbol', strategyMeta.universe.join(',')];
  }

  const snapshotFamily = inferSnapshotFamily(args, strategyMeta);
  let { snapshot, quality } = loadUsableSources(args, { family: snapshotFamily });
  if (quality) writeJson(DEFAULT_QUALITY_REPORT, quality);
  const optimizationQualityError = backtestDataQualityError(quality, args);
  const optimizationQualityWarning = optimizationQualityError && (quality?.usable_records || 0) > 0
    ? optimizationQualityError.replace(/^Data-quality validation failed[:.]?\s*/, 'Optimization continues on the usable slice despite data-quality validation. ')
    : null;
  if (optimizationQualityError && (quality?.usable_records || 0) === 0) {
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ error: optimizationQualityError.replace(/^Data-quality validation failed[:.]?\s*/, 'Optimization input failed data-quality validation. ') }, null, 2));
    } else {
      console.error(optimizationQualityError.replace(/^Data-quality validation failed[:.]?\s*/, 'Optimization input failed data-quality validation. '));
    }
    return 1;
  }
  if (optimizationQualityWarning && !hasFlag(args, '--json')) {
    console.warn(`\x1b[1;33m[WARN]\x1b[0m ${optimizationQualityWarning}`);
  }
  const defaults = researchConfig.backtest_defaults || {};
  const timeframe = optionValue(args, '--timeframe', null);
  const from = optionValue(args, '--from', null);
  const to = optionValue(args, '--to', null);
  const horizon = numericOption(args, '--horizon', defaults.horizon || 5);
  const threshold = numericOption(args, '--threshold', strategyMeta?.risk?.signal_threshold || defaults.threshold || 0.55);
  const costBps = numericOption(args, '--cost-bps', defaults.cost_bps || 5);
  const feeBps = numericOption(args, '--fee-bps', defaults.fee_bps || costBps / 2);
  const slippageBps = numericOption(args, '--slippage-bps', defaults.slippage_bps || costBps / 2);
  const tailAlpha = numericOption(args, '--tail-alpha', defaults.tail_alpha || 0.05);
  const monteCarloRuns = numericOption(args, '--monte-carlo-runs', defaults.monte_carlo_runs || 200);
  const trainRatio = numericOption(args, '--train-ratio', defaults.train_ratio || 0.7);
  const targetSymbol = optionValue(args, '--symbol', 'AAPL').split(',')[0].trim();
  const safeSymbol = targetSymbol.replace(/[^a-zA-Z0-9_]/g, '_');
  const targetTf = timeframe || '1d';
  const binaryFile = path.join(STORAGE_TS_DIR, `${safeSymbol}_${targetTf}.bin`);
  const explicitInput = optionValue(args, '--input', null);

  // Native optimization owns binary ts-index input only. An explicit snapshot
  // must remain on the JS path so caller-selected evidence is never bypassed.
  if (!explicitInput && findBackendBinary() && require('node:fs').existsSync(binaryFile)) {
    try {
      const cppResult = runBackend([
        'optimize',
        '--symbols', targetSymbol,
        '--timeframe', targetTf,
        '--ts-dir', STORAGE_TS_DIR,
        '--train-ratio', String(trainRatio),
        '--cost-bps', String(costBps),
      ]);
      if (cppResult && cppResult.ok && cppResult.winner) {
        const payload = {
          tested: cppResult.tested,
          winner: cppResult.winner.params,
          indicator_periods: cppResult.winner.params,
          winner_net_return: cppResult.winner.train.net_return,
          winner_max_drawdown: cppResult.winner.train.max_drawdown,
          winner_sharpe: cppResult.winner.train.sharpe,
          winner_sortino: cppResult.winner.train.sharpe,
          winner_win_rate: cppResult.winner.train.win_rate,
          winner_ev: cppResult.winner.train.expectancy,
          winner_tail_var_95: null,
          winner_mc_loss_prob: null,
          oos_trades: 0,
          oos_net_return: cppResult.winner.test.net_return,
          oos_ev: cppResult.winner.test.expectancy,
          oos_overfit_warning: cppResult.winner.test.overfit_warning,
          output,
        };
        if (hasFlag(args, '--json')) {
          printPayload(payload, args);
        } else {
          console.log(renderOptimize(payload));
        }
        return 0;
      }
    } catch (err) {
      if (!hasFlag(args, '--json')) {
        console.warn(`\x1b[90m[INFO] Native C++ optimizer notice: ${err.message}; using JS fallback.\x1b[0m`);
      }
    }
  }

  const { grid, basePeriods, indicatorFlags } = buildOptimizationGrid(strategyMeta, args, periodOptionsFromStrategy, normalizeIndicatorFlags);

  let runs = [];
  await withLoadingAnimation('Optimizing indicators', async () => {
    runs = grid.map((periods) => {
      const frame = calculateRollingFeatureFrame(snapshot.sources, 2, periods);
      const filtered = filterFeatureFrame(frame, { timeframe, from, to });
      const split = splitFeatureFrame(filtered, trainRatio);
      const backtestOptions = {
        strategy: 'cnn_momentum',
        model: defaults.model || 'cnn_window_v0',
        horizon,
        threshold,
        costBps,
        feeBps,
        slippageBps,
        tailAlpha,
        monteCarloRuns,
        propFirm: 'none',
        propFirmProfile: null,
        engine: 'js', // grid loop: stay on JS to avoid one C++ spawn per combination
      };
      const trainBacktest = runBacktest(split.train, backtestOptions);
      const testBacktest = runBacktest(split.test, backtestOptions);
      const overfit_warning = (testBacktest.metrics.sharpe_ratio < (trainBacktest.metrics.sharpe_ratio * 0.5)) || (testBacktest.metrics.expected_value < 0);

      return {
        periods,
        indicator_periods: periods,
        enabled_indicators: indicatorFlags,
        timeframe: timeframe || testBacktest.timeframe,
        period: { from, to },
        feature_count: filtered.feature_count,
        train: trainBacktest.metrics,
        test: testBacktest.metrics,
        trades: trainBacktest.metrics.trades,
        net_return: trainBacktest.metrics.net_return,
        max_drawdown: trainBacktest.metrics.max_drawdown,
        sharpe_ratio: trainBacktest.metrics.sharpe_ratio,
        sortino_ratio: trainBacktest.metrics.sortino_ratio,
        win_rate: trainBacktest.metrics.win_rate,
        expected_value: trainBacktest.metrics.expected_value,
        oos_trades: testBacktest.metrics.trades,
        oos_net_return: testBacktest.metrics.net_return,
        oos_expected_value: testBacktest.metrics.expected_value,
        overfit_warning,
        score: trainBacktest.metrics.net_return - trainBacktest.metrics.max_drawdown + (trainBacktest.metrics.expected_value * 10) - (overfit_warning ? 100 : 0), // Penalize overfitting
      };
      }).sort((a, b) => b.score - a.score || b.net_return - a.net_return);
  }, args);
  if (runs.length > 0 && runs[0].feature_count === 0) {
    const message = 'Optimization input has no usable features in the current slice. Refresh the cache with backfill or choose a different timeframe/strategy.';
    if (hasFlag(args, '--json')) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(message);
    }
    return 1;
  }

  const report = {
    generated_at: new Date().toISOString(),
    source_mode: snapshot.mode,
    data_quality_ok: quality ? quality.ok : true,
    data_quality_warning: optimizationQualityWarning,
    timeframe: timeframe || 'all',
    period: { from, to },
    train_ratio: trainRatio,
    indicator_periods: basePeriods,
    enabled_indicators: indicatorFlags,
    tested: runs.length,
    winner: runs[0] || null,
    top: runs.slice(0, 10),
  };
  writeJson(output, report);

  const payload = {
    tested: report.tested,
    winner: report.winner ? report.winner.periods : 'none',
    indicator_periods: report.indicator_periods,
    winner_net_return: report.winner ? report.winner.net_return : 0,
    winner_max_drawdown: report.winner ? report.winner.max_drawdown : 0,
    winner_sharpe: report.winner ? report.winner.sharpe_ratio : null,
    winner_sortino: report.winner ? report.winner.sortino_ratio : null,
    winner_win_rate: report.winner ? report.winner.win_rate : 0,
    winner_ev: report.winner ? report.winner.expected_value : 0,
    winner_tail_var_95: report.winner && report.winner.train && report.winner.train.tail_risk ? report.winner.train.tail_risk.value_at_risk : null,
    winner_mc_loss_prob: report.winner && report.winner.train && report.winner.train.monte_carlo ? report.winner.train.monte_carlo.probability_of_loss : null,
    oos_trades: report.winner ? report.winner.oos_trades : 0,
    oos_net_return: report.winner ? report.winner.oos_net_return : 0,
    oos_ev: report.winner ? report.winner.oos_expected_value : 0,
    oos_overfit_warning: report.winner ? report.winner.overfit_warning : false,
    output,
  };

  if (hasFlag(args, '--json')) {
    printPayload(payload, args);
  } else {
    console.log(renderOptimize(payload));
  }
  return 0;
}

async function commandEdgeDecay(args, helpers = {}) {
  const {
    resolveStrategyBacktestDefaults = require('./research.js').resolveStrategyBacktestDefaults,
    resolveStrategyPathInput = require('./research.js').resolveStrategyPathInput,
    inferSnapshotFamily = require('./research.js').inferSnapshotFamily,
    symbolsFromArgs = require('./research.js').symbolsFromArgs,
    periodOptionsFromStrategy = require('./research.js').periodOptionsFromStrategy,
    filterFeatureFrameBySymbols = require('./research.js').filterFeatureFrameBySymbols,
  } = helpers;

  let resolved;
  try {
    resolved = await resolveStrategyBacktestDefaults(args);
  } catch (error) {
    printPayload({ error: error.message }, args);
    return 1;
  }
  args = resolved.args;
  const strategyConfig = resolved.strategy;

  let strategyPath = resolveStrategyPathInput(optionValue(args, '--strategy', null));
  let strategyMeta = null;
  if (strategyPath) {
    const { inspectStrategyFile } = require('../strategy/strategy.js');
    strategyMeta = inspectStrategyFile(strategyPath);
  }

  const timeframe = optionValue(args, '--timeframe', null);
  const snapshotFamily = inferSnapshotFamily(args, strategyMeta);
  const { snapshot, quality } = loadUsableSources(args, { family: snapshotFamily });
  const defaults = researchConfig.backtest_defaults || {};
  const selectedSymbols = symbolsFromArgs(args);

  const periodOpts = periodOptionsFromStrategy(strategyMeta, args);
  const fullFrame = filterFeatureFrameBySymbols(
    calculateRollingFeatureFrame(snapshot.sources, 2, periodOpts),
    selectedSymbols
  );

  const backtestOptions = {
    strategy: strategyMeta?.name || strategyConfig?.name || 'cnn_momentum',
    model: optionValue(args, '--model', strategyMeta?.model || defaults.model || 'cnn_window_v0'),
    horizon: numericOption(args, '--horizon', defaults.horizon || 5),
    threshold: numericOption(args, '--threshold', strategyMeta?.risk?.signal_threshold || defaults.threshold || 0.55),
    costBps: numericOption(args, '--cost-bps', defaults.cost_bps || 5),
    feeBps: numericOption(args, '--fee-bps', defaults.fee_bps || 2),
    slippageBps: numericOption(args, '--slippage-bps', defaults.slippage_bps || 3),
    tailAlpha: numericOption(args, '--tail-alpha', defaults.tail_alpha || 0.05),
    monteCarloRuns: 50,
    propFirm: null,
    propFirmProfile: null,
    engine: 'js', // window loop: stay on JS to avoid one C++ spawn per rolling window
  };

  const WINDOWS = [30, 90, 180, 365];
  const nowTs = Date.now();

  const windows = [];
  const _edgeProgress = createProgress('Edge decay analysis', WINDOWS.length + 1);
  for (const days of WINDOWS) {
    const fromIso = new Date(nowTs - days * 86400_000).toISOString();
    const slice = filterFeatureFrame(fullFrame, { timeframe, from: fromIso });
    if (!slice || slice.feature_count === 0) { _edgeProgress.tick(1, `${days}d skipped`); continue; }
    const bt = runBacktest(slice, backtestOptions);
    windows.push({ label: `${days}d`, days, ...bt.metrics });
    _edgeProgress.tick(1, `${days}d`);
  }
  const fullFiltered = filterFeatureFrame(fullFrame, { timeframe });
  if (fullFiltered && fullFiltered.feature_count > 0) {
    const bt = runBacktest(fullFiltered, backtestOptions);
    windows.push({ label: 'full', days: null, ...bt.metrics });
  }
  _edgeProgress.done();

  if (windows.length < 2) {
    printPayload({ error: 'Insufficient data for edge decay analysis. Run backfill first.' }, args);
    return 1;
  }

  const fullEntry = windows.find(w => w.label === 'full') || windows.at(-1);
  const recentEntry = windows.find(w => w.days === 90) || windows.find(w => w.days === 180) || windows[0];
  const fullSharpe = fullEntry?.sharpe_ratio ?? 0;
  const recentSharpe = recentEntry?.sharpe_ratio ?? 0;

  let decayScore;
  if (fullSharpe <= 0) {
    decayScore = recentSharpe > 0 ? 1.2 : 0;
  } else {
    decayScore = Math.max(0, recentSharpe / fullSharpe);
  }

  const verdict = decayScore >= 0.8 ? 'STABLE' : decayScore >= 0.5 ? 'DEGRADING' : 'DECAYED';

  const report = {
    generated_at: new Date().toISOString(),
    strategy: backtestOptions.strategy,
    timeframe: timeframe || 'all',
    decay_score: Math.round(decayScore * 100) / 100,
    verdict,
    reference_sharpe_full: Math.round((fullSharpe ?? 0) * 1000) / 1000,
    reference_sharpe_recent: Math.round((recentSharpe ?? 0) * 1000) / 1000,
    windows: windows.map(w => ({
      window: w.label,
      sharpe: Math.round((w.sharpe_ratio ?? 0) * 1000) / 1000,
      net_return: Math.round((w.net_return ?? 0) * 10000) / 10000,
      win_rate: Math.round((w.win_rate ?? 0) * 1000) / 1000,
      max_drawdown: Math.round((w.max_drawdown ?? 0) * 10000) / 10000,
      trades: w.trades ?? 0,
    })),
  };

  if (hasFlag(args, '--json')) {
    printPayload(report, args);
  } else {
    const col = (s, n) => String(s ?? '').padEnd(n);
    const num = (v, d = 4) => (v == null ? 'n/a' : Number(v).toFixed(d)).padStart(9);
    console.log(`\n\x1b[1;36mEdge Decay Analysis – ${report.strategy}\x1b[0m`);
    console.log(`\x1b[90m${'─'.repeat(62)}\x1b[0m`);
    console.log(`  ${col('Window', 8)} ${col('Sharpe', 9)} ${col('Return', 9)} ${col('Win%', 7)} ${col('MaxDD', 9)} ${col('Trades', 7)}`);
    console.log(`\x1b[90m${'─'.repeat(62)}\x1b[0m`);
    for (const w of report.windows) {
      const tag = w.window === recentEntry.label ? '\x1b[1;33m*\x1b[0m' : ' ';
      const sharp = w.sharpe < 0 ? `\x1b[31m${num(w.sharpe)}\x1b[0m` : num(w.sharpe);
      console.log(`${tag} ${col(w.window, 8)} ${sharp} ${num(w.net_return)} ${num(w.win_rate, 2)} ${num(w.max_drawdown)} ${String(w.trades).padStart(7)}`);
    }
    console.log(`\x1b[90m${'─'.repeat(62)}\x1b[0m`);
    const verdictColor = verdict === 'STABLE' ? '\x1b[32m' : verdict === 'DEGRADING' ? '\x1b[33m' : '\x1b[31m';
    console.log(`  Decay Score: ${verdictColor}${report.decay_score}\x1b[0m   Verdict: ${verdictColor}${verdict}\x1b[0m`);
    console.log(`  (* = reference recent window for decay score)`);
    console.log('');
  }
  return 0;
}

const { commandSweep } = require('./research_sweep.js');

module.exports = {
  buildOptimizationGrid,
  renderOptimize,
  commandOptimize,
  commandEdgeDecay,
  commandSweep,
};
