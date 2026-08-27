'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  compileSweepPreflight,
  inspectConfiguredStrategies,
  nativeDatasetArg,
  nativeEvaluatorArg,
  parseFiniteNumber,
  parsePositiveInteger,
  renderSweep,
} = require('../../../backend/cli/commands/research/research_sweep.js');
const { buildResearchDatasetCatalog } = require('../../../shared/lib/market/research_dataset_catalog.js');
const { selectInternalEvaluators } = require('../../../shared/lib/strategy/sweep_contracts.js');
const { findBackendBinary, REPO_ROOT } = require('../../../shared/lib/runtime/paths.js');

const DAY_MS = 86_400_000;
const NOW = Date.now();

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-sweep-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeDailyBin(tsDir, symbol, count = 120, family = 'equities') {
  const buffer = Buffer.allocUnsafe(8 + count * 48);
  buffer.write('SOVT', 0, 'ascii');
  buffer.writeUInt32LE(count, 4);
  for (let index = 0; index < count; index += 1) {
    const close = 100 + index * 0.2;
    const offset = 8 + index * 48;
    buffer.writeDoubleLE(NOW - (count - index) * DAY_MS, offset);
    buffer.writeDoubleLE(close - 0.1, offset + 8);
    buffer.writeDoubleLE(close + 0.5, offset + 16);
    buffer.writeDoubleLE(close - 0.5, offset + 24);
    buffer.writeDoubleLE(close, offset + 32);
    buffer.writeDoubleLE(1000 + index, offset + 40);
  }
  const binPath = path.join(tsDir, `${symbol}_1d.bin`);
  fs.writeFileSync(binPath, buffer);
  fs.writeFileSync(path.join(tsDir, `${symbol}_1d.meta.json`), JSON.stringify({
    family,
    provider: 'test',
    symbol,
    timeframe: '1d',
  }));
  return {
    binPath,
    fingerprint: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function singleEquityConfig() {
  return {
    equities: {
      enabled: true,
      symbols: ['AAPL'],
      timeframes: ['1d'],
      universe_matrix: { grid: { USA: { technology: ['AAPL'] } } },
    },
    quality: { reject_stale: true },
  };
}

test('sweep option parsing rejects malformed numbers instead of using defaults', () => {
  assert.equal(parsePositiveInteger(['--top-k', 'garbage'], '--top-k', 20), null);
  assert.equal(parsePositiveInteger(['--top-k', '0'], '--top-k', 20), null);
  assert.equal(parsePositiveInteger(['--min-bars', 'garbage'], '--min-bars', 100), null);
  assert.equal(parsePositiveInteger([], '--top-k', 20), 20);
  assert.equal(parseFiniteNumber(['--cost-bps', 'NaN'], '--cost-bps', 5), null);
  assert.equal(parseFiniteNumber([], '--cost-bps', 5), 5);
});

test('real configured strategy registry is fully classified as unsupported by proxies', () => {
  const strategies = inspectConfiguredStrategies();
  assert.equal(strategies.length, 16);
  assert.equal(strategies.every((strategy) => strategy.path.startsWith('config/strategies/')), true);
  assert.equal(strategies.some((strategy) => strategy.lane === 'cross_asset'), true);
  assert.equal(strategies.some((strategy) => strategy.kind === 'ml'), true);
});

test('native argument compilers preserve exact eligible pairs and evaluator identities', async (t) => {
  const tsDir = tempDir(t);
  writeDailyBin(tsDir, 'AAPL');
  const catalog = await buildResearchDatasetCatalog({
    config: singleEquityConfig(),
    tsDir,
    symbols: 'AAPL',
    timeframes: '1d',
    now: NOW,
  });
  const evaluators = selectInternalEvaluators('proxy_mean_reversion_v1');
  assert.equal(
    nativeDatasetArg(catalog.datasets),
    `equities:AAPL@1d#${catalog.datasets[0].fingerprint}`,
  );
  assert.equal(nativeEvaluatorArg(evaluators.selected), 'MeanReversion');
});

test('preflight rejects unsupported evaluators and missing datasets', async () => {
  const result = await compileSweepPreflight([
    '--ts-dir', path.join(os.tmpdir(), 'missing-research-sweep-dir'),
    '--symbols', 'AAPL',
    '--timeframes', '1d',
    '--evaluators', 'configured_trend_following',
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.errors.includes('unsupported_evaluators'), true);
  assert.equal(result.errors.includes('no_supported_evaluators'), true);
  assert.equal(result.errors.includes('no_eligible_datasets'), true);
  assert.equal(result.capabilityRegistry.counts.configured_total, 16);
  assert.equal(result.capabilityRegistry.counts.configured_supported, 0);
});

test('native sweep CLI requires validated exact datasets and evaluators', () => {
  const binary = findBackendBinary();
  assert.notEqual(binary, null, 'native build must exist for this contract test');
  const result = spawnSync(binary, ['sweep'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schema_version, 2);
  assert.equal(payload.research_only, true);
  assert.equal(payload.promotion_eligible, false);
  assert.match(payload.error, /validated --datasets is required/);
});

test('native sweep CLI rejects malformed numeric options before execution', () => {
  const binary = findBackendBinary();
  assert.notEqual(binary, null, 'native build must exist for this contract test');
  const result = spawnSync(binary, ['sweep', '--top-k', 'garbage'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.error, /positive integers/);
});

test('native sweep schema distinguishes validation selection from untouched holdout', (t) => {
  const binary = findBackendBinary();
  assert.notEqual(binary, null, 'native build must exist for this contract test');
  const tsDir = tempDir(t);
  const fixture = writeDailyBin(tsDir, 'AAPL', 240);
  const result = spawnSync(binary, [
    'sweep',
    '--ts-dir', tsDir,
    '--datasets', `equities:AAPL@1d#${fixture.fingerprint}`,
    '--evaluators', 'MomentumTrend',
    '--top-k', '1',
    '--max-bars', '240',
    '--cost-bps', '0',
    '--train-ratio', '0.60',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.selection_protocol, 'train_validation_then_single_untouched_holdout');
  assert.equal(payload.fitness_source, 'validation_metrics');
  assert.equal(payload.holdout_influences_selection, false);
  assert.equal(payload.effective_bars, 240);
  assert.equal(payload.total_pass1_evaluations > 0, true);
  assert.equal(payload.total_pass2_evaluations > 0, true);
  assert.equal(payload.total_combinations_evaluated,
    payload.total_pass1_evaluations + payload.total_pass2_evaluations);
  assert.equal(payload.leader_board.length, 1);
  const leader = payload.leader_board[0];
  assert.equal(typeof leader.train_metrics.trades, 'number');
  assert.equal(typeof leader.validation_metrics.trades, 'number');
  assert.equal(typeof leader.holdout_metrics.trades, 'number');
  assert.equal(leader.test_metrics.compatibility_alias_for, 'holdout_metrics');
  assert.equal(leader.test_metrics.net_return, leader.holdout_metrics.net_return);
});

test('native sweep rejects changed snapshots and family mismatches', (t) => {
  const binary = findBackendBinary();
  assert.notEqual(binary, null, 'native build must exist for this contract test');
  const tsDir = tempDir(t);
  const fixture = writeDailyBin(tsDir, 'AAPL', 240);

  fs.appendFileSync(fixture.binPath, Buffer.from([0]));
  const changed = spawnSync(binary, [
    'sweep',
    '--ts-dir', tsDir,
    '--datasets', `equities:AAPL@1d#${fixture.fingerprint}`,
    '--evaluators', 'MomentumTrend',
  ], { cwd: REPO_ROOT, encoding: 'utf8', shell: false });
  assert.equal(changed.status, 1);
  assert.match(JSON.parse(changed.stdout).error, /dataset_fingerprint_mismatch/);

  const restored = writeDailyBin(tsDir, 'AAPL', 240, 'indices');
  const wrongFamily = spawnSync(binary, [
    'sweep',
    '--ts-dir', tsDir,
    '--datasets', `equities:AAPL@1d#${restored.fingerprint}`,
    '--evaluators', 'MomentumTrend',
  ], { cwd: REPO_ROOT, encoding: 'utf8', shell: false });
  assert.equal(wrongFamily.status, 1);
  assert.match(JSON.parse(wrongFamily.stdout).error, /dataset_family_mismatch/);
});

test('native sweep rejects ratios that would otherwise be silently clamped', (t) => {
  const binary = findBackendBinary();
  assert.notEqual(binary, null, 'native build must exist for this contract test');
  const tsDir = tempDir(t);
  const fixture = writeDailyBin(tsDir, 'AAPL', 240);
  const result = spawnSync(binary, [
    'sweep',
    '--ts-dir', tsDir,
    '--datasets', `equities:AAPL@1d#${fixture.fingerprint}`,
    '--evaluators', 'MomentumTrend',
    '--train-ratio', '0.89',
  ], { cwd: REPO_ROOT, encoding: 'utf8', shell: false });
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /between 0\.40 and 0\.75/);
});

test('native sweep fails when no trial reaches minimum validation evidence', (t) => {
  const binary = findBackendBinary();
  assert.notEqual(binary, null, 'native build must exist for this contract test');
  const tsDir = tempDir(t);
  const fixture = writeDailyBin(tsDir, 'AAPL', 100);
  const result = spawnSync(binary, [
    'sweep',
    '--ts-dir', tsDir,
    '--datasets', `equities:AAPL@1d#${fixture.fingerprint}`,
    '--evaluators', 'MomentumTrend',
    '--top-k', '1',
    '--max-bars', '100',
    '--cost-bps', '0',
    '--train-ratio', '0.75',
  ], { cwd: REPO_ROOT, encoding: 'utf8', shell: false });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).error, 'no_selection_eligible_trials');
});

test('human sweep output labels proxies and blocks promotion', () => {
  const text = renderSweep({
    dataset_catalog: { counts: { eligible: 1, rejected: 2 }, rejected: [] },
    capability_registry: { counts: { configured_rejected: 14 } },
    total_combinations_evaluated: 10,
    leader_board: [],
  });
  assert.match(text, /RESEARCH-ONLY GLOBAL PROXY SWEEP/);
  assert.match(text, /Promotion Eligible: NO/);
  assert.match(text, /validation fitness, then one untouched holdout/);
  assert.match(text, /VALIDATION-SELECTED PROXY LEADERBOARD/);
  assert.match(text, /cannot promote or execute/);
});
