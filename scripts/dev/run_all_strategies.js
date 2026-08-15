'use strict';

/**
 * All-Strategy Backtest Benchmark Runner
 * ---------------------------------------
 * Runs all registered platform strategies across binary time-series datasets
 * using native C++ acceleration and prints a comprehensive leaderboard summary.
 *
 * Usage:
 *   node scripts/dev/run_all_strategies.js [--timeframe 1d|15m|1m] [--threshold 0.55] [--json]
 */

const fs = require('node:fs');
const path = require('node:path');
const bridge = require('../../shared/lib/runtime/backend_bridge');
const { listStrategyFiles, inspectStrategyFile } = require('../../backend/cli/commands/strategy/strategy');
const { STORAGE_DATA_DIR, STORAGE_TS_DIR } = require('../../shared/lib/runtime/paths');
const { optionValue, hasFlag, numericOption } = require('../../backend/cli/lib/utils');

function runAllStrategies(args = process.argv.slice(2)) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(`
All-Strategy Backtest Benchmark Runner
---------------------------------------
Options:
  --timeframe <tf>    Timeframe resolution (default: 1d; e.g. 1m, 15m, 1h, 1d)
  --threshold <val>   Signal threshold override (default: strategy config or 0.55)
  --days <n>          Historical window days limit (default: 0 = full sample)
  --json              Output structured JSON payload
  --help, -h          Show this help message
`);
    return;
  }

  const requestedTf = optionValue(args, '--timeframe', '1d');
  const userThreshold = optionValue(args, '--threshold', null);
  const userDays = numericOption(args, '--days', 0);
  const jsonMode = hasFlag(args, '--json');

  const files = listStrategyFiles();
  const strategies = files.map((f) => inspectStrategyFile(f)).filter((s) => s.ok && s.enabled);

  if (!jsonMode) {
    console.log('='.repeat(120));
    console.log(` ALL-STRATEGY NATIVE BACKTEST BENCHMARK LEADERBOARD (Timeframe: ${requestedTf.toUpperCase()})`);
    console.log('='.repeat(120));
    console.log(
      `| ${'#'.padStart(2)} | ${'Strategy Name'.padEnd(26)} | ${'Family'.padEnd(12)} | ${'Universe'.padEnd(20)} | ${'Trades'.padStart(9)} | ${'Net Return'.padStart(12)} | ${'Max DD'.padStart(8)} | ${'Sharpe'.padStart(7)} | ${'Status'.padEnd(10)} | ${'Runtime'.padStart(7)} |`
    );
    console.log('-'.repeat(120));
  }

  const results = [];
  let rank = 1;
  const totalStartTime = Date.now();

  for (const strat of strategies) {
    const name = strat.name;
    const family = strat.family || 'general';
    let universe = strat.sections?.universe || [];
    if (!Array.isArray(universe) || universe.length === 0) {
      universe = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
    }

    const threshold = userThreshold !== null ? Number(userThreshold) : (strat.risk?.signal_threshold || 0.55);
    const horizon = strat.risk?.max_holding_days || 3;

    const cmdArgs = [
      'backtest', '--mode', 'native',
      '--input', STORAGE_TS_DIR || path.join(STORAGE_DATA_DIR, 'ts'),
      '--symbol', universe.join(','),
      '--timeframe', requestedTf,
      '--threshold', String(threshold),
      '--horizon', String(horizon),
      '--monte-carlo-runs', '0',
      '--json',
    ];

    if (userDays > 0) {
      cmdArgs.push('--days', String(userDays));
    }

    const stratStartTime = Date.now();
    const res = bridge.runBackendCommand(cmdArgs);
    const elapsedMs = Date.now() - stratStartTime;
    const elapsedStr = elapsedMs >= 1000 ? (elapsedMs / 1000).toFixed(2) + 's' : elapsedMs + 'ms';

    const m = res?.metrics || {};
    const trades = m.trades || 0;
    const netRetVal = m.net_return;
    const netRetStr = netRetVal != null ? (netRetVal > 99 ? '>9999%' : (netRetVal * 100).toFixed(2) + '%') : '0.00%';
    const maxDDVal = m.max_drawdown;
    const maxDDStr = maxDDVal != null ? (maxDDVal * 100).toFixed(2) + '%' : '0.00%';
    const sharpeVal = m.sharpe_ratio;
    const sharpeStr = sharpeVal != null ? sharpeVal.toFixed(2) : 'n/a';

    const symsStr = universe.slice(0, 2).join(',') + (universe.length > 2 ? `+${universe.length - 2}` : '');
    const status = trades > 0 ? (netRetVal > 0 ? 'PROFITABLE' : 'LOSS') : 'NO_BARS';

    const record = {
      rank,
      strategy: name,
      family,
      timeframe: requestedTf,
      universe,
      threshold,
      horizon,
      trades,
      net_return: netRetVal,
      max_drawdown: maxDDVal,
      sharpe_ratio: sharpeVal,
      status,
      runtime_ms: elapsedMs,
    };
    results.push(record);

    if (!jsonMode) {
      console.log(
        `| ${String(rank).padStart(2)} | ${name.padEnd(26)} | ${family.padEnd(12)} | ${symsStr.padEnd(20)} | ${String(trades).padStart(9)} | ${netRetStr.padStart(12)} | ${maxDDStr.padStart(8)} | ${sharpeStr.padStart(7)} | ${status.padEnd(10)} | ${elapsedStr.padStart(7)} |`
      );
    }
    rank++;
  }

  const totalElapsedSec = ((Date.now() - totalStartTime) / 1000).toFixed(2);

  if (!jsonMode) {
    console.log('='.repeat(120));
    console.log(`Summary: Evaluated ${strategies.length} strategies across ${requestedTf} binary datasets in ${totalElapsedSec}s.`);
    console.log('='.repeat(120));
  }

  const outputPayload = {
    generated_at: new Date().toISOString(),
    timeframe: requestedTf,
    total_strategies: strategies.length,
    total_runtime_sec: Number(totalElapsedSec),
    leaderboard: results,
  };

  const artifactPath = path.join(STORAGE_DATA_DIR, 'backtests', 'all_strategies_leaderboard.json');
  try {
    const dir = path.dirname(artifactPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify(outputPayload, null, 2), 'utf8');
    if (!jsonMode) {
      console.log(`Saved report artifact to: ${artifactPath}`);
    }
  } catch (_) {}

  if (jsonMode) {
    console.log(JSON.stringify(outputPayload, null, 2));
  }
}

if (require.main === module) {
  runAllStrategies();
}

module.exports = { runAllStrategies };
