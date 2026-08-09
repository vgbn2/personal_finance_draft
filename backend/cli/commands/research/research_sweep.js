'use strict';

const {
  optionValue,
  hasFlag,
  printPayload,
  REPO_ROOT,
} = require('../../lib/utils.js');
const { readStrategyRegistry } = require('../strategy/strategy.js');
const { inspectStrategyFile } = require('../strategy/strategy_presenter.js');
const { runBackend } = require('../../../api/server/services/cli_executor_cache.js');
const { findBackendBinary, STORAGE_TS_DIR } = require('../../../../shared/lib/runtime/paths.js');
const {
  buildResearchRunSpec,
  buildStrategyCapabilityRegistry,
  selectInternalEvaluators,
} = require('../../../../shared/lib/strategy/sweep_contracts.js');
const {
  buildResearchDatasetCatalog,
} = require('../../../../shared/lib/market/research_dataset_catalog.js');

function errorPayload(error, details = {}) {
  return {
    type: 'global_sweep_result',
    schema_version: 2,
    research_only: true,
    promotion_eligible: false,
    ok: false,
    error,
    ...details,
  };
}

function strictNumericValue(args, name, fallback) {
  const raw = optionValue(args, name, null);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parsePositiveInteger(args, name, fallback) {
  const value = strictNumericValue(args, name, fallback);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parseFiniteNumber(args, name, fallback) {
  return strictNumericValue(args, name, fallback);
}

function inspectConfiguredStrategies() {
  return readStrategyRegistry().map((filePath) => inspectStrategyFile(filePath));
}

function nativeDatasetArg(datasets) {
  return datasets
    .map((row) => `${row.family}:${row.symbol}@${row.timeframe}#${row.fingerprint}`)
    .join(',');
}

function nativeEvaluatorArg(evaluators) {
  return evaluators.map((row) => row.native_archetype).join(',');
}

function renderSweep(payload) {
  const lines = [
    '',
    '=== RESEARCH-ONLY GLOBAL PROXY SWEEP ===',
    'Promotion Eligible: NO',
    `Eligible Datasets: ${payload.dataset_catalog?.counts?.eligible ?? 0}`,
    `Rejected Datasets: ${payload.dataset_catalog?.counts?.rejected ?? 0}`,
    `Configured Strategies Rejected: ${payload.capability_registry?.counts?.configured_rejected ?? 0}`,
    `Evaluations Reported: ${payload.total_combinations_evaluated ?? 0}`,
    'Selection: validation fitness, then one untouched holdout evaluation per winner',
    '',
    `--- VALIDATION-SELECTED PROXY LEADERBOARD (Top ${payload.leader_board?.length ?? 0}) ---`,
  ];
  for (const trial of payload.leader_board || []) {
    lines.push(
      `${trial.rank}. ${trial.symbol}@${trial.timeframe} ${trial.strategy} `
        + `fitness=${Number(trial.fitness_score).toFixed(4)} `
        + `holdout=${trial.overfit_grade}`,
    );
  }
  if ((payload.dataset_catalog?.rejected || []).length > 0) {
    lines.push('', 'Dataset rejections:');
    for (const row of payload.dataset_catalog.rejected.slice(0, 10)) {
      lines.push(`- ${row.dataset_id}: ${row.reason}`);
    }
  }
  lines.push('', 'This output is research evidence only and cannot promote or execute a strategy.', '');
  return lines.join('\n');
}

async function compileSweepPreflight(args) {
  const evaluators = selectInternalEvaluators(optionValue(args, '--evaluators', 'proxy'));
  const capabilityRegistry = buildStrategyCapabilityRegistry(inspectConfiguredStrategies());
  const maxBars = parsePositiveInteger(args, '--max-bars', 50000);
  const topK = parsePositiveInteger(args, '--top-k', 20);
  const costBps = parseFiniteNumber(args, '--cost-bps', 5.0);
  const trainRatio = parseFiniteNumber(args, '--train-ratio', 0.70);
  const minBars = parsePositiveInteger(args, '--min-bars', 100);
  const invalidOptions = [];
  if (maxBars === null) invalidOptions.push('--max-bars');
  if (topK === null) invalidOptions.push('--top-k');
  if (minBars === null) invalidOptions.push('--min-bars');
  if (costBps === null || costBps < 0) invalidOptions.push('--cost-bps');
  if (trainRatio === null || trainRatio < 0.40 || trainRatio > 0.75) invalidOptions.push('--train-ratio');

  const datasetCatalog = await buildResearchDatasetCatalog({
    tsDir: optionValue(args, '--ts-dir', STORAGE_TS_DIR),
    symbols: optionValue(args, '--symbols', 'all'),
    timeframes: optionValue(args, '--timeframes', 'all'),
    allowStale: hasFlag(args, '--allow-stale'),
    minBars: minBars || 100,
  });

  const errors = [];
  if (invalidOptions.length > 0) errors.push(`invalid_options:${invalidOptions.join(',')}`);
  if (evaluators.rejected.length > 0) errors.push('unsupported_evaluators');
  if (evaluators.selected.length === 0) errors.push('no_supported_evaluators');
  if (datasetCatalog.datasets.length === 0) errors.push('no_eligible_datasets');

  const options = {
    max_bars: maxBars,
    min_bars: minBars,
    top_k: topK,
    cost_bps: costBps,
    train_ratio: trainRatio,
  };
  const runSpec = errors.length === 0
    ? buildResearchRunSpec({ datasets: datasetCatalog.datasets, evaluators: evaluators.selected, options })
    : null;
  return {
    ok: errors.length === 0,
    errors,
    evaluators,
    capabilityRegistry,
    datasetCatalog,
    options,
    runSpec,
  };
}

async function commandSweep(args) {
  if (!findBackendBinary({ repoRoot: REPO_ROOT })) {
    const payload = errorPayload('native_backend_binary_not_found', {
      hint: 'Build native C++ core via npm run native:build',
    });
    printPayload(payload, args);
    return 1;
  }

  const preflight = await compileSweepPreflight(args);
  if (!preflight.ok) {
    const payload = errorPayload('sweep_preflight_failed', {
      reasons: preflight.errors,
      evaluator_rejections: preflight.evaluators.rejected,
      capability_registry: preflight.capabilityRegistry,
      dataset_catalog: preflight.datasetCatalog,
    });
    printPayload(payload, args);
    return 1;
  }

  const tsDir = optionValue(args, '--ts-dir', STORAGE_TS_DIR);
  const payload = runBackend([
    'sweep',
    '--ts-dir', tsDir,
    '--datasets', nativeDatasetArg(preflight.datasetCatalog.datasets),
    '--evaluators', nativeEvaluatorArg(preflight.evaluators.selected),
    '--top-k', String(preflight.options.top_k),
    '--max-bars', String(preflight.options.max_bars),
    '--cost-bps', String(preflight.options.cost_bps),
    '--train-ratio', String(preflight.options.train_ratio),
  ], { cwd: REPO_ROOT });

  const result = {
    ...payload,
    schema_version: 2,
    research_only: true,
    promotion_eligible: false,
    run_spec: preflight.runSpec,
    capability_registry: preflight.capabilityRegistry,
    dataset_catalog: preflight.datasetCatalog,
  };
  if (!payload || !payload.ok) {
    printPayload(errorPayload(payload?.error || 'sweep_failed', result), args);
    return 1;
  }

  if (hasFlag(args, '--json')) printPayload(result, args);
  else console.log(renderSweep(result));
  return 0;
}

module.exports = {
  commandSweep,
  compileSweepPreflight,
  errorPayload,
  inspectConfiguredStrategies,
  nativeDatasetArg,
  nativeEvaluatorArg,
  parseFiniteNumber,
  parsePositiveInteger,
  renderSweep,
  strictNumericValue,
};
