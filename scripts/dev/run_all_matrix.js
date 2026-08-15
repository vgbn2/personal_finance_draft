'use strict';

/**
 * Master Platform Strategy, Timeframe & ML Model Matrix Benchmark Runner
 * ----------------------------------------------------------------------
 * Sweeps all registered platform strategies across all timeframes (1m..1mo)
 * and all ML / ONNX models using native C++ acceleration.
 *
 * Usage:
 *   node scripts/dev/run_all_matrix.js [--timeframe 1d|15m|1m|all] [--strategy all|<name>] [--model all|<name>] [--threshold 0.55] [--json]
 */

const fs = require('node:fs');
const path = require('node:path');
const bridge = require('../../shared/lib/runtime/backend_bridge');
const { listStrategyFiles, inspectStrategyFile } = require('../../backend/cli/commands/strategy/strategy');
const { modelCandidates, ONNX_MODEL_NAMES } = require('../../shared/lib/ml/models');
const { STORAGE_DATA_DIR, STORAGE_TS_DIR } = require('../../shared/lib/runtime/paths');
const { optionValue, hasFlag, numericOption } = require('../../backend/cli/lib/utils');

const ALL_TIMEFRAMES = ['1d', '4h', '1h', '30m', '15m', '5m', '1m'];

function getAvailableModels() {
  const mlNames = modelCandidates.map((m) => m.name);
  const onnxNames = Array.from(ONNX_MODEL_NAMES || []);
  return [...new Set([...mlNames, ...onnxNames])];
}

function runMasterMatrix(args = process.argv.slice(2)) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(`
Master Platform Strategy, Timeframe & ML Model Matrix Benchmark Runner
----------------------------------------------------------------------
Options:
  --timeframe <tf>    Timeframe resolution ('all' or comma-sep e.g. '1d,15m,1m'; default: '1d')
  --strategy <name>   Strategy name ('all' or specific name; default: 'all')
  --model <name>      ML Model name ('all' or specific name; default: 'all')
  --threshold <val>   Signal threshold override (default: strategy config or 0.55)
  --days <n>          Historical window days limit (default: 0 = full sample)
  --json              Output structured JSON payload
  --help, -h          Show this help message
`);
    return;
  }

  const tfInput = optionValue(args, '--timeframe', '1d');
  const stratInput = optionValue(args, '--strategy', 'all');
  const modelInput = optionValue(args, '--model', 'all');
  const userThreshold = optionValue(args, '--threshold', null);
  const userDays = numericOption(args, '--days', 0);
  const jsonMode = hasFlag(args, '--json');

  // Resolve timeframes
  let targetTfs = ALL_TIMEFRAMES;
  if (tfInput !== 'all') {
    const parsed = tfInput.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (parsed.length > 0) targetTfs = parsed;
  }

  // Resolve strategies
  const files = listStrategyFiles();
  let strategies = files.map((f) => inspectStrategyFile(f)).filter((s) => s.ok && s.enabled);
  if (stratInput !== 'all') {
    strategies = strategies.filter((s) => s.name === stratInput || s.path.includes(stratInput));
  }

  // Resolve models
  const availableModels = getAvailableModels();
  let targetModels = availableModels;
  if (modelInput !== 'all') {
    const parsed = modelInput.split(',').map((s) => s.trim()).filter(Boolean);
    if (parsed.length > 0) targetModels = parsed;
  }

  if (!jsonMode) {
    console.log('='.repeat(128));
    console.log(` MASTER PLATFORM BENCHMARK MATRIX (Strategies: ${strategies.length} | Timeframes: ${targetTfs.join(',')} | Models: ${targetModels.length})`);
    console.log('='.repeat(128));
    console.log(
      `| ${'#'.padStart(3)} | ${'Strategy Name'.padEnd(24)} | ${'TF'.padStart(4)} | ${'Model'.padEnd(24)} | ${'Trades'.padStart(8)} | ${'Net Return'.padStart(12)} | ${'Max DD'.padStart(8)} | ${'Sharpe'.padStart(7)} | ${'Status'.padEnd(9)} | ${'Time'.padStart(6)} |`
    );
    console.log('-'.repeat(128));
  }

  const results = [];
  let rank = 1;
  const masterStartTime = Date.now();

  for (const strat of strategies) {
    const name = strat.name;
    const family = strat.family || 'general';
    let universe = strat.sections?.universe || [];
    if (!Array.isArray(universe) || universe.length === 0) {
      universe = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
    }

    const threshold = userThreshold !== null ? Number(userThreshold) : (strat.risk?.signal_threshold || 0.55);
    const horizon = strat.risk?.max_holding_days || 3;

    for (const tf of targetTfs) {
      for (const modelName of targetModels) {
        const cmdArgs = [
          'backtest', '--mode', 'native',
          '--input', STORAGE_TS_DIR || path.join(STORAGE_DATA_DIR, 'ts'),
          '--symbol', universe.join(','),
          '--timeframe', tf,
          '--threshold', String(threshold),
          '--horizon', String(horizon),
          '--monte-carlo-runs', '0',
          '--json',
        ];

        if (userDays > 0) {
          cmdArgs.push('--days', String(userDays));
        }

        const trialStartTime = Date.now();
        const res = bridge.runBackendCommand(cmdArgs);
        const elapsedMs = Date.now() - trialStartTime;
        const elapsedStr = elapsedMs >= 1000 ? (elapsedMs / 1000).toFixed(2) + 's' : elapsedMs + 'ms';

        const m = res?.metrics || {};
        const trades = m.trades || 0;
        const netRetVal = m.net_return;
        const netRetStr = netRetVal != null ? (netRetVal > 99 ? '>9999%' : (netRetVal * 100).toFixed(2) + '%') : '0.00%';
        const maxDDVal = m.max_drawdown;
        const maxDDStr = maxDDVal != null ? (maxDDVal * 100).toFixed(2) + '%' : '0.00%';
        const sharpeVal = m.sharpe_ratio;
        const sharpeStr = sharpeVal != null ? sharpeVal.toFixed(2) : 'n/a';

        const status = trades > 0 ? (netRetVal > 0 ? 'PROFITABLE' : 'LOSS') : 'NO_BARS';

        const record = {
          rank,
          strategy: name,
          family,
          timeframe: tf,
          model: modelName,
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
            `| ${String(rank).padStart(3)} | ${name.padEnd(24)} | ${tf.padStart(4)} | ${modelName.padEnd(24)} | ${String(trades).padStart(8)} | ${netRetStr.padStart(12)} | ${maxDDStr.padStart(8)} | ${sharpeStr.padStart(7)} | ${status.padEnd(9)} | ${elapsedStr.padStart(6)} |`
          );
        }
        rank++;
      }
    }
  }

  const totalElapsedSec = ((Date.now() - masterStartTime) / 1000).toFixed(2);

  if (!jsonMode) {
    console.log('='.repeat(128));
    console.log(`Master Matrix Summary: Evaluated ${results.length} matrix combinations (${strategies.length} strats × ${targetTfs.length} TFs × ${targetModels.length} models) in ${totalElapsedSec}s.`);
    console.log('='.repeat(128));
  }

  const outputPayload = {
    generated_at: new Date().toISOString(),
    total_combinations: results.length,
    strategies_evaluated: strategies.length,
    timeframes_evaluated: targetTfs,
    models_evaluated: targetModels,
    total_runtime_sec: Number(totalElapsedSec),
    leaderboard: results,
  };

  const artifactPath = path.join(STORAGE_DATA_DIR, 'backtests', 'master_matrix_leaderboard.json');
  try {
    const dir = path.dirname(artifactPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify(outputPayload, null, 2), 'utf8');
    if (!jsonMode) {
      console.log(`Saved master matrix report artifact to: ${artifactPath}`);
    }
  } catch (_) {}

  if (jsonMode) {
    console.log(JSON.stringify(outputPayload, null, 2));
  }
}

if (require.main === module) {
  runMasterMatrix();
}

module.exports = { runMasterMatrix };
