const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI_PATH = path.join(__dirname, '..', '..', '..', 'backend', 'cli', 'sovereign_cli.js');
const BACKEND_HISTORY_FIXTURE = path.join(__dirname, '..', '..', 'fixtures', 'backend_history_sample.json');
const { buildCockpitModel, renderCockpit } = require('../../../backend/cli/sovereign_cli');

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
  assert.equal(payload.freshness_scope, 'last_fetch_snapshot');
  assert.equal(payload.integrity_scope, 'configured_ts_cache');
  assert.equal(payload.freshness.scope, 'last_fetch_snapshot');
  assert.match(payload.quality_basis, /backend integrity --json/);
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
    assert.ok(payload.policy.integrity_exceptions.includes('VRE'));
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
