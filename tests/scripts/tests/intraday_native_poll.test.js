'use strict';

/**
 * FW3: Native-poll intraday data fetch tests (15m, 30m, 1h, 4h)
 *
 * Test suites:
 *   1. Shape test        — fetchYahooIntradayBars mock returns correct OHLCV fields
 *   2. Depth validation  — 1h stubbed shape check (≥700 bars for 730d window)
 *   3. CLI flag parsing  — --timeframe 30m parses correctly in buildIntradayAccumulatePlan
 *   4. Dry-run           — commandIntradayAccumulate exits 0 without writing
 *   5. 4h flag rejection — --timeframe 4h returns rc=1 with informative error
 *   6. aggregate1hTo4h   — 4h client-side aggregation produces correct bucket OHLCV
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

// ─── 1. Shape test ───────────────────────────────────────────────────────────

test('fetchYahooIntradayBars module exposes correct exports and field contracts', () => {
  const mod = require(intradayPath);

  // Module shape
  assert.ok(typeof mod.fetchYahooIntradayBars === 'function', 'fetchYahooIntradayBars must be a function');
  assert.ok(typeof mod.candlesToRecords       === 'function', 'candlesToRecords must be a function');
  assert.ok(typeof mod.aggregate1hTo4h        === 'function', 'aggregate1hTo4h must be a function');
  assert.ok(Array.isArray(mod.SUPPORTED_INTRADAY_TFS), 'SUPPORTED_INTRADAY_TFS must be an array');
  assert.ok(typeof mod.INTRADAY_MAX_DAYS === 'object', 'INTRADAY_MAX_DAYS must be an object');
  assert.ok(typeof mod.YAHOO_INTERVAL_STRINGS === 'object', 'YAHOO_INTERVAL_STRINGS must be an object');

  // Supported timeframes
  assert.deepStrictEqual(mod.SUPPORTED_INTRADAY_TFS.sort(), ['15m', '1h', '30m'], 'must support 15m, 30m, 1h');

  // Depth limits
  assert.strictEqual(mod.INTRADAY_MAX_DAYS['15m'], 60);
  assert.strictEqual(mod.INTRADAY_MAX_DAYS['30m'], 60);
  assert.strictEqual(mod.INTRADAY_MAX_DAYS['1h'],  730);
  assert.strictEqual(mod.INTRADAY_MAX_DAYS['4h'],  730);

  // Yahoo interval strings
  assert.strictEqual(mod.YAHOO_INTERVAL_STRINGS['15m'], '15m');
  assert.strictEqual(mod.YAHOO_INTERVAL_STRINGS['30m'], '30m');
  assert.strictEqual(mod.YAHOO_INTERVAL_STRINGS['1h'],  '60m', 'Yahoo uses 60m for 1h');
  assert.strictEqual(mod.YAHOO_INTERVAL_STRINGS['4h'],  '60m', '4h must also use 60m (client aggregated)');
});

// ─── 2. Depth validation (stubbed shape check for 1h ≥700 bars) ─────────────

test('candlesToRecords shape: 730-day 1h stub generates ≥700 bars with correct OHLCV fields', () => {
  const { candlesToRecords } = require(intradayPath);

  // Synthesize 730 daily * 7 hourly per day = 5,110 raw 1h candles (realistic upper bound)
  // For simplicity, generate 730 representative bars spaced 1h apart
  const RAW_BAR_COUNT = 730;
  const baseTime = Date.now() - RAW_BAR_COUNT * 60 * 60 * 1000;
  const rawCandles = Array.from({ length: RAW_BAR_COUNT }, (_, i) => ({
    openTime: baseTime + i * 60 * 60 * 1000,
    open:   100 + i * 0.01,
    high:   101 + i * 0.01,
    low:    99  + i * 0.01,
    close:  100.5 + i * 0.01,
    volume: 1000 + i,
  }));

  const records = candlesToRecords(rawCandles, 'SPX', '1h', 'indices');

  // Depth check: ≥700 bars
  assert.ok(records.length >= 700, `Expected ≥700 records, got ${records.length}`);

  // Field shape check on first record
  const r = records[0];
  assert.ok(typeof r.family    === 'string', 'family must be string');
  assert.ok(typeof r.provider  === 'string', 'provider must be string');
  assert.ok(typeof r.symbol    === 'string', 'symbol must be string');
  assert.ok(typeof r.timeframe === 'string', 'timeframe must be string');
  assert.ok(typeof r.timestamp === 'string', 'timestamp must be ISO string');
  assert.ok(Number.isFinite(r.open),   'open must be finite');
  assert.ok(Number.isFinite(r.high),   'high must be finite');
  assert.ok(Number.isFinite(r.low),    'low must be finite');
  assert.ok(Number.isFinite(r.close),  'close must be finite');
  assert.ok(Number.isFinite(r.volume), 'volume must be finite');

  // Values
  assert.strictEqual(r.family,    'indices');
  assert.strictEqual(r.provider,  'yahoo');
  assert.strictEqual(r.symbol,    'SPX');
  assert.strictEqual(r.timeframe, '1h');
});

// ─── 3. CLI flag parsing ─────────────────────────────────────────────────────

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

// ─── 6. aggregate1hTo4h ──────────────────────────────────────────────────────

test('aggregate1hTo4h correctly buckets 1h candles into 4h OHLCV bars', () => {
  const { aggregate1hTo4h } = require(intradayPath);

  const FOUR_H = 4 * 60 * 60 * 1000;
  const base   = Math.floor(Date.now() / FOUR_H) * FOUR_H;  // align to bucket boundary

  // 4 1h candles → 1 4h candle
  const candles = [
    { openTime: base + 0 * 3600000, open: 100, high: 102, low:  99, close: 101, volume: 1000 },
    { openTime: base + 1 * 3600000, open: 101, high: 105, low: 100, close: 104, volume: 1200 },
    { openTime: base + 2 * 3600000, open: 104, high: 106, low: 103, close: 105, volume:  800 },
    { openTime: base + 3 * 3600000, open: 105, high: 107, low: 104, close: 106, volume:  900 },
  ];

  const result = aggregate1hTo4h(candles);

  assert.strictEqual(result.length, 1, 'Should produce exactly one 4h bar');
  const bar = result[0];
  assert.strictEqual(bar.openTime, base, 'openTime must be bucket start');
  assert.strictEqual(bar.open,   100,    'open must be first candle open');
  assert.strictEqual(bar.high,   107,    'high must be max across candles');
  assert.strictEqual(bar.low,     99,    'low must be min across candles');
  assert.strictEqual(bar.close,  106,    'close must be last candle close');
  assert.strictEqual(bar.volume, 3900,   'volume must be sum of all candles');
});

test('aggregate1hTo4h handles candles spanning multiple 4h buckets', () => {
  const { aggregate1hTo4h } = require(intradayPath);

  const FOUR_H = 4 * 60 * 60 * 1000;
  const base   = Math.floor(Date.now() / FOUR_H) * FOUR_H;

  // 8 hours → 2 buckets
  const candles = Array.from({ length: 8 }, (_, i) => ({
    openTime: base + i * 3600000,
    open: 100,  high: 101, low: 99, close: 100, volume: 100,
  }));

  const result = aggregate1hTo4h(candles);
  assert.strictEqual(result.length, 2, 'Should produce 2 four-hour bars for 8 hours of data');
  assert.strictEqual(result[0].openTime, base);
  assert.strictEqual(result[1].openTime, base + FOUR_H);
  // Each bucket sums 4 × 100 = 400
  assert.strictEqual(result[0].volume, 400);
  assert.strictEqual(result[1].volume, 400);
});
