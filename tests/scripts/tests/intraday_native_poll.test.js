'use strict';

/**
 * FW3: Native-poll intraday data tests (15m, 30m, 1h)
 *
 * The actual fetch/aggregation runs through the shared ingest path
 * (selectYahooBase → fetchYahooBaseCandles → aggregateCandles); intraday_yahoo.js
 * is constants-only, so these tests cover the constants contract + the command:
 *   1. Constants contract — SUPPORTED_INTRADAY_TFS + INTRADAY_MAX_DAYS (sourced from YAHOO_MAX_DAYS)
 *   2. CLI flag parsing   — --timeframe 30m parses correctly in buildIntradayAccumulatePlan
 *   3. Dry-run            — commandIntradayAccumulate exits 0 without writing
 *   4. 4h flag rejection  — --timeframe 4h returns rc=1 with informative error
 */

const test   = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const path   = require('node:path');

const REPO_ROOT    = path.resolve(__dirname, '../../..');
const dataPath     = path.resolve(REPO_ROOT, 'backend/cli/commands/data/data.js');
const ingestPath   = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data.js');
const utilsPath    = path.resolve(REPO_ROOT, 'backend/cli/lib/utils.js');
const intradayPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/intraday_yahoo.js');

// ─── helpers ─────────────────────────────────────────────────────────────────

function freshData() {
  delete require.cache[dataPath];
  return require(dataPath);
}

/**
 * Run commandIntradayAccumulate with stubbed ingest + utils.
 * snapshotFactory receives the ingestMarketData options and returns a snapshot.
 */
async function runAccumulateWithStubs(cmdArgs, fakeConfig, snapshotFactory = null) {
  const ingestStub = async (...args) => (
    snapshotFactory ? snapshotFactory(...args) : { sources: [], errors: [], mode: 'test' }
  );
  ingestStub.loadConfig = async () => fakeConfig;
  ingestStub.ingestMarketData = ingestStub;

  const outputs = [];
  const realUtils = require(utilsPath);
  const utilsStub = { ...realUtils, printPayload: (payload) => outputs.push(payload) };
  const stubs = { [ingestPath]: ingestStub, [utilsPath]: utilsStub };

  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    const resolved = (() => {
      try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; }
    })();
    if (resolved && stubs[resolved]) return stubs[resolved];
    return orig.apply(this, arguments);
  };

  delete require.cache[dataPath];
  const dataMod = require(dataPath);

  let rc;
  try {
    rc = await dataMod.commandIntradayAccumulate(cmdArgs);
  } finally {
    Module._load = orig;
    delete require.cache[dataPath];
    delete require.cache[ingestPath];
  }
  return { outputs, rc };
}

// Minimal fake config used by plan/command tests
const FAKE_CONFIG = {
  indices:     { symbols: ['SPX', 'NDX', 'FAKEIDX'] },
  commodities: { symbols: ['XAUUSD', 'USOIL'] },
  fx:          { symbols: ['EURUSD', 'USDJPY'] },
};

// ─── 1. Constants contract ───────────────────────────────────────────────────

test('intraday_yahoo exposes constants-only contract sourced from YAHOO_MAX_DAYS', () => {
  const mod = require(intradayPath);
  const { YAHOO_MAX_DAYS } = require(path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/constants.js'));

  // Constants-only module: the dead fetch/aggregate functions were removed (production
  // routes through the shared selectYahooBase/aggregateCandles path).
  assert.strictEqual(mod.fetchYahooIntradayBars, undefined, 'dead fetch fn removed');
  assert.strictEqual(mod.candlesToRecords, undefined, 'dead records fn removed');
  assert.strictEqual(mod.aggregate1hTo4h, undefined, 'dead aggregate fn removed');

  assert.deepStrictEqual(mod.SUPPORTED_INTRADAY_TFS.slice().sort(), ['15m', '1h', '30m']);

  // INTRADAY_MAX_DAYS must mirror the single canonical YAHOO_MAX_DAYS table (no drift).
  for (const tf of ['15m', '30m', '1h', '4h']) {
    assert.strictEqual(mod.INTRADAY_MAX_DAYS[tf], YAHOO_MAX_DAYS[tf], `${tf} cap matches YAHOO_MAX_DAYS`);
  }
});

// ─── 2. CLI flag parsing ─────────────────────────────────────────────────────

test('buildIntradayAccumulatePlan parses --timeframe 30m correctly and maps symbols', () => {
  const { buildIntradayAccumulatePlan } = freshData();
  const plan = buildIntradayAccumulatePlan(FAKE_CONFIG, { timeframe: '30m' });

  assert.strictEqual(plan.provider,  'yahoo');
  assert.strictEqual(plan.timeframe, '30m');
  assert.strictEqual(plan.max_days,  60, '30m cap must be 60 days');

  const jobKeys = plan.jobs.map((j) => `${j.family}:${j.symbol}`).sort();
  assert.deepStrictEqual(jobKeys, [
    'commodities:USOIL', 'commodities:XAUUSD',
    'fx:EURUSD', 'fx:USDJPY',
    'indices:NDX', 'indices:SPX',
  ]);
  assert.deepStrictEqual(plan.skipped_symbols, [
    { family: 'indices', symbol: 'FAKEIDX', reason: 'no yahoo intraday symbol mapping' },
  ]);
});

test('buildIntradayAccumulatePlan parses --timeframe 1h and reports 730-day depth', () => {
  const { buildIntradayAccumulatePlan } = freshData();
  const plan = buildIntradayAccumulatePlan(FAKE_CONFIG, { timeframe: '1h' });

  assert.strictEqual(plan.timeframe, '1h');
  assert.strictEqual(plan.max_days, 730, '1h cap must be 730 days');
});

test('buildIntradayAccumulatePlan honors --family filter', () => {
  const { buildIntradayAccumulatePlan } = freshData();

  const fxOnly = buildIntradayAccumulatePlan(FAKE_CONFIG, { timeframe: '15m', family: 'fx' });
  assert.ok(fxOnly.jobs.every((j) => j.family === 'fx'));
  assert.strictEqual(fxOnly.jobs.length, 2);

  // 'all' acts as no filter
  const allFam = buildIntradayAccumulatePlan(FAKE_CONFIG, { timeframe: '15m', family: 'all' });
  assert.strictEqual(allFam.jobs.length, 6);
});

test('buildIntradayAccumulatePlan throws on invalid timeframe', () => {
  const { buildIntradayAccumulatePlan } = freshData();
  assert.throws(
    () => buildIntradayAccumulatePlan(FAKE_CONFIG, { timeframe: '4h' }),
    /Invalid --timeframe/,
  );
  assert.throws(
    () => buildIntradayAccumulatePlan(FAKE_CONFIG, { timeframe: '5m' }),
    /Invalid --timeframe/,
  );
});

// ─── 4. Dry-run ──────────────────────────────────────────────────────────────

test('commandIntradayAccumulate dry-run exits 0 and reports plan without fetching', async () => {
  const fetchCalls = [];
  const { outputs, rc } = await runAccumulateWithStubs(
    ['--timeframe', '1h', '--dry-run', '--json'],
    FAKE_CONFIG,
    (opts) => { fetchCalls.push(opts); return { sources: [], errors: [] }; },
  );

  assert.strictEqual(rc, 0, 'dry-run must exit 0');
  assert.strictEqual(fetchCalls.length, 0, 'dry-run must NOT call ingestMarketData');
  const out = outputs[0];
  assert.strictEqual(out.ok,       true);
  assert.strictEqual(out.dry_run,  true);
  assert.strictEqual(out.provider, 'yahoo');
  assert.strictEqual(out.timeframe, '1h');
  assert.ok(out.jobs >= 6, 'Should have at least 6 jobs in plan');
  assert.ok(typeof out.message === 'string', 'Must include a message string');
});

test('commandIntradayAccumulate dry-run for 30m reports 60-day cap', async () => {
  const { outputs, rc } = await runAccumulateWithStubs(
    ['--timeframe', '30m', '--dry-run', '--json'],
    FAKE_CONFIG,
  );
  assert.strictEqual(rc, 0);
  const out = outputs[0];
  assert.strictEqual(out.timeframe, '30m');
  assert.strictEqual(out.max_days, 60);
});

// ─── 5. 4h flag rejection ────────────────────────────────────────────────────

test('commandIntradayAccumulate rejects --timeframe 4h with rc=1 and informative error', async () => {
  const { outputs, rc } = await runAccumulateWithStubs(
    ['--timeframe', '4h', '--json'],
    FAKE_CONFIG,
  );
  assert.strictEqual(rc, 1);
  assert.strictEqual(outputs[0].ok, false);
  assert.match(outputs[0].error, /4h/);
  assert.match(outputs[0].error, /not available natively/i);
});

test('commandIntradayAccumulate rejects --days exceeding timeframe cap', async () => {
  const { outputs, rc } = await runAccumulateWithStubs(
    ['--timeframe', '15m', '--days', '61', '--json'],
    FAKE_CONFIG,
  );
  assert.strictEqual(rc, 1);
  assert.strictEqual(outputs[0].ok, false);
  assert.match(outputs[0].error, /at most --days 60/);
});

// ─── 5. Silent-zero guard ────────────────────────────────────────────────────

test('commandIntradayAccumulate counts a zero-bar / no-error symbol as FAILED (no silent success)', async () => {
  // An empty provider response with no explicit error must NOT report ok.
  const { outputs, rc } = await runAccumulateWithStubs(
    ['--timeframe', '1h', '--symbols', 'SPX', '--json'],
    FAKE_CONFIG,
    () => ({ sources: [], errors: [] }),
  );
  assert.strictEqual(rc, 1, 'zero bars + no error must exit 1');
  const out = outputs[0];
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.errors, 1);
  assert.strictEqual(out.successful, 0);
  const spx = (out.symbol_results || []).find((r) => r.symbol === 'SPX');
  assert.ok(spx && spx.ok === false, 'SPX must be marked failed');
  assert.match(spx.error, /no native Yahoo/i);
});
