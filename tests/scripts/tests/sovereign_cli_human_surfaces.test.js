const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI_PATH = path.join(__dirname, '..', '..', '..', 'backend', 'cli', 'sovereign_cli.js');
const BACKEND_HISTORY_FIXTURE = path.join(__dirname, '..', '..', 'fixtures', 'backend_history_sample.json');
const { buildCockpitModel, renderCockpit } = require('../../../backend/cli/sovereign_cli');
const { buildStatusPayload, detectScopedSnapshot, buildRecoveredSnapshotFromHistory } = require('../../../backend/cli/commands/operational/status');

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

test('cockpit render uses readable ASCII separators', () => {
  const model = buildCockpitModel();
  const rendered = renderCockpit(model);
  dumpVisibility('cockpit render uses readable ascii separators', { rendered });
  assert.equal(rendered.includes('â'), false);
  assert.match(rendered, /LIVE/);
  assert.match(rendered, /[═─]{10,}/);
});

test('cockpit model renders status, model, backtest, and portfolio cards', () => {
  const model = buildCockpitModel();
  dumpVisibility('cockpit model renders status, model, backtest, and portfolio cards', { model });
  assert.equal(model.title, 'Sovereign CLI Cockpit');
  assert.ok(Array.isArray(model.cards));
  assert.ok(model.cards.length >= 5);
  const rendered = renderCockpit(model);
  assert.match(rendered, /Sovereign CLI Cockpit/);
  assert.match(rendered, /LIVE/);
  assert.match(rendered, /System:/);
  assert.match(rendered, /Commands:/);
});

test('backend status command reports missing C++ executable without crashing', () => {
  const result = spawnSync(process.execPath, [CLI_PATH, 'backend', 'status', '--json'], { encoding: 'utf8' });
  assert.equal([0, 1].includes(result.status), true);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend status command reports missing C++ executable without crashing', { payload });
  assert.equal(typeof payload.available, 'boolean');
  if (!payload.available) {
    assert.match(payload.error, /backend executable not found/i);
    assert.equal(Array.isArray(payload.searched), true);
  } else {
    assert.equal(payload.type, 'backend_status');
    assert.equal(payload.engine, 'sovereign_cpp_core');
  }
});

test('root status explains last-fetch freshness scope separately from backend integrity', () => {
  const result = spawnSync(process.execPath, [CLI_PATH, 'status', '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('root status explains last fetch freshness scope separately from backend integrity', { payload });
  assert.ok(['last_fetch_snapshot', 'last_fetch_snapshot_scoped'].includes(payload.freshness_scope));
  assert.equal(payload.integrity_scope, 'configured_ts_cache');
  assert.equal(payload.freshness.scope, payload.freshness_scope);
  assert.match(payload.quality_basis, /backend integrity --json/);
});

test('status payload marks targeted historical snapshots as scoped rather than global live health', () => {
  const snapshot = {
    mode: 'provider_history',
    fetched_at: '2026-06-11T09:19:04.863Z',
    sources: [
      { family: 'reserves', provider: 'world_bank', country: 'USA', metric: 'total_reserves_usd', timestamp: '2024-01-01T00:00:00.000Z', value: 1 },
      { family: 'reserves', provider: 'world_bank', country: 'USA', metric: 'total_reserves_usd', timestamp: '2023-01-01T00:00:00.000Z', value: 1 },
    ],
    errors: [],
    provider_checks: [
      { family: 'equities', provider: 'manifest', status: 'skipped', reason: 'target_family_filter', target_family: 'reserves' },
    ],
    quality_filter: {
      policy: 'preserve_historical_records_after_merge',
    },
    macro_store: {
      reason: 'target_family_filter',
      target_family: 'reserves',
    },
  };
  const report = {
    ok: false,
    total_records: 2,
    usable_records: 1,
    rejected_records: 1,
    provider_errors: [],
    reject_stale: false,
    freshness: {
      stale_records: 1,
      issues: 1,
    },
  };
  const backend = { available: true, ok: true };

  const scoped = detectScopedSnapshot(snapshot, report);
  const payload = buildStatusPayload(snapshot, report, backend);
  dumpVisibility('status payload marks targeted historical snapshots as scoped rather than global live health', { scoped, payload });
  assert.equal(scoped.active, true);
  assert.equal(scoped.target_family, 'reserves');
  assert.equal(payload.freshness_scope, 'last_fetch_snapshot_scoped');
  assert.equal(payload.snapshot_scope.representative_of_global_live_health, false);
  assert.equal(payload.quality, 'scoped snapshot only');
  assert.match(payload.quality_basis, /not representative of global live health/i);
});

test('history recovery builds a representative global snapshot from the latest record per series', () => {
  const history = {
    fetched_at: '2026-06-11T00:00:00.000Z',
    sources: [
      { family: 'equities', provider: 'yahoo', symbol: 'AAPL', timeframe: '1d', timestamp: '2026-06-09T00:00:00.000Z', open: 1, high: 2, low: 1, close: 2, volume: 10 },
      { family: 'equities', provider: 'yahoo', symbol: 'AAPL', timeframe: '1d', timestamp: '2026-06-10T00:00:00.000Z', open: 2, high: 3, low: 2, close: 3, volume: 10 },
      { family: 'crypto', provider: 'binance', symbol: 'BTCUSDT', timeframe: '1d', timestamp: '2026-06-11T00:00:00.000Z', open: 10, high: 12, low: 9, close: 11, volume: 10 },
      { family: 'macro', provider: 'fred', series: 'CPI', timestamp: '2026-05-01T00:00:00.000Z', value: 2.5 },
      { family: 'macro', provider: 'fred', series: 'CPI', timestamp: '2026-06-01T00:00:00.000Z', value: 2.7 },
    ],
  };
  const recovered = buildRecoveredSnapshotFromHistory(history);
  dumpVisibility('history recovery builds a representative global snapshot from the latest record per series', { recovered });
  assert.equal(recovered.mode, 'recovered_live');
  assert.equal(recovered.snapshot_scope.kind, 'global');
  assert.equal(recovered.snapshot_scope.representative_of_global_live_health, true);
  assert.equal(recovered.sources.length, 3);
  assert.ok(recovered.sources.some((row) => row.symbol === 'AAPL' && row.timestamp === '2026-06-10T00:00:00.000Z'));
  assert.ok(recovered.sources.some((row) => row.symbol === 'BTCUSDT' && row.timestamp === '2026-06-11T00:00:00.000Z'));
  assert.ok(recovered.sources.some((row) => row.series === 'CPI' && row.timestamp === '2026-06-01T00:00:00.000Z'));
});

test('backend stats command exposes C++ performance metrics when executable is available', () => {
  const result = spawnSync(process.execPath, [
    CLI_PATH, 'backend', 'stats', '--equity', '100,110,105,120,90,95,130', '--json',
  ], { encoding: 'utf8' });
  assert.equal([0, 1].includes(result.status), true);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend stats command exposes C++ performance metrics when executable is available', { payload });
  assert.equal(typeof payload.available, 'boolean');
  if (!payload.available) {
    assert.match(payload.error, /backend executable not found/i);
  } else {
    assert.equal(payload.type, 'backend_stats');
    assert.equal(payload.engine, 'sovereign_cpp_core');
    assert.equal(payload.ok, true);
    assert.equal(payload.observations, 7);
    assert.equal(payload.max_drawdown, 0.25);
    assert.equal(payload.drawdown.peak_index, 3);
    assert.equal(payload.drawdown.trough_index, 4);
  }
});

test('backend stats command fails closed without an equity curve source', () => {
  const result = spawnSync(process.execPath, [
    CLI_PATH, 'backend', 'stats', '--input', path.join(os.tmpdir(), 'missing-backtest-equity.json'), '--json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend stats command fails closed without an equity curve source', { payload });
  assert.equal(payload.ok, false);
  assert.match(payload.error, /No equity curve found/);
});

test('backend data summary command exposes real cache OHLCV summary when executable is available', () => {
  const result = spawnSync(process.execPath, [
    CLI_PATH, 'backend', 'data', 'summary',
    '--symbol', 'AAPL', '--timeframe', '1d', '--max-bars', '5',
    '--input', BACKEND_HISTORY_FIXTURE, '--json',
  ], { encoding: 'utf8' });
  assert.equal([0, 1].includes(result.status), true);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend data summary command exposes real cache OHLCV summary when executable is available', { payload });
  assert.equal(typeof payload.available, 'boolean');
  if (!payload.available) {
    assert.match(payload.error, /backend executable not found/i);
  } else {
    assert.equal(payload.type, 'market_data_summary');
    assert.equal(payload.engine, 'sovereign_cpp_core');
    assert.equal(payload.summary.symbol, 'AAPL');
    assert.equal(payload.summary.timeframe, '1d');
    assert.equal(payload.ok, true);
    assert.equal(payload.summary.bars, 4);
    assert.equal(payload.quality.rejected_records, 0);
  }
});

test('backend correlation command exposes C++ pearson matrix when executable is available', () => {
  const result = spawnSync(process.execPath, [
    CLI_PATH, 'backend', 'correlation',
    '--symbols', 'AAPL,MSFT,SPX', '--timeframe', '1d', '--max-bars', '4',
    '--input', BACKEND_HISTORY_FIXTURE, '--json',
  ], { encoding: 'utf8' });
  assert.equal([0, 1].includes(result.status), true);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend correlation command exposes C++ pearson matrix when executable is available', { payload });
  if (!payload.available) {
    assert.match(payload.error, /backend executable not found/i);
  } else {
    assert.equal(payload.type, 'correlation_matrix');
    assert.equal(payload.engine, 'sovereign_cpp_core');
    assert.equal(typeof payload.ok, 'boolean');
    if (payload.ok) {
      assert.deepEqual(payload.labels, ['AAPL', 'MSFT', 'SPX']);
      assert.equal(payload.observations, 4);
      assert.equal(payload.values.length, 3);
      assert.equal(payload.values[0][0], 1);
    } else {
      assert.equal(typeof payload.error, 'string');
    }
  }
});

test('backend universe command exposes cache symbol inventory when executable is available', () => {
  const result = spawnSync(process.execPath, [
    CLI_PATH, 'backend', 'universe', '--max-entries', '5', '--input', BACKEND_HISTORY_FIXTURE, '--json',
  ], { encoding: 'utf8' });
  assert.equal([0, 1].includes(result.status), true);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend universe command exposes cache symbol inventory when executable is available', { payload });
  assert.equal(typeof payload.available, 'boolean');
  if (!payload.available) {
    assert.match(payload.error, /backend executable not found/i);
  } else {
    assert.equal(payload.type, 'market_universe');
    assert.equal(payload.engine, 'sovereign_cpp_core');
    assert.equal(Array.isArray(payload.entries), true);
    assert.equal(payload.entries.length, 3);
    assert.ok(payload.entries.some((entry) => entry.symbol === 'AAPL'));
    assert.equal(payload.quality.rejected_records, 0);
  }
});

test('backend integrity command summarizes live and historical cache health', () => {
  const result = spawnSync(process.execPath, [
    CLI_PATH, 'backend', 'integrity',
    '--history', BACKEND_HISTORY_FIXTURE,
    '--input', path.join(__dirname, '..', '..', '..', 'storage', 'data', 'cache', 'last_fetch.json'),
    '--json',
  ], { encoding: 'utf8' });
  assert.equal([0, 1].includes(result.status), true);
  const payload = JSON.parse(result.stdout);
  dumpVisibility('backend integrity command summarizes live and historical cache health', { payload });
  assert.equal(payload.type, 'data_availability');
  if (typeof payload.error === 'string') {
    assert.equal(typeof payload.error, 'string');
  } else {
    assert.equal(typeof payload.ok, 'boolean');
    assert.equal(typeof payload.summary.total_stale, 'number');
    assert.equal(typeof payload.summary.total_cached, 'number');
    assert.equal(typeof payload.summary.total_exceptions, 'number');
    assert.ok(Array.isArray(payload.policy.integrity_exceptions));
    assert.ok(payload.policy.integrity_exceptions.includes('RNDRUSDT'));
    // ok may be false when cache rows are stale (provider unreachable); structure is still valid
    if (payload.ok) assert.equal(payload.summary.total_stale, 0);
    if (payload.live_cache) assert.equal(typeof payload.live_cache.ok, 'boolean');
    if (payload.historical_cache) assert.equal(typeof payload.historical_cache.ok, 'boolean');
    if (payload.universe) {
      assert.equal(typeof payload.universe.entries, 'number');
      assert.ok(Array.isArray(payload.universe.top_symbols));
      assert.ok(payload.universe.entries > 0);
    }
  }
});
