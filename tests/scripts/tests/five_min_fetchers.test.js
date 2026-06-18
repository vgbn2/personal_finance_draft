'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const yahooPath = path.resolve(REPO_ROOT, 'shared/lib/providers/yahoo.js');
const ingestIndexPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/index.js');

// ingest_market_data/index.js is split across sibling files (candle_utils.js,
// manifests.js, providers/prediction.js, snapshot_fetchers.js). Those siblings bind
// their own top-level provider imports at require-time, so purging only
// ingestIndexPath's cache entry leaves a stale (possibly differently-stubbed)
// sibling cached from a previous test. Purge the whole directory tree alongside it.
const INGEST_DIR_PREFIX = path.dirname(ingestIndexPath) + path.sep;
function purgeIngestModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(INGEST_DIR_PREFIX)) delete require.cache[key];
  }
}

function makeBar(openTime, close = 100) {
  return { openTime, open: close - 1, high: close + 1, low: close - 2, close, volume: 0 };
}

function freshRequire(filePath, stubs = {}) {
  delete require.cache[filePath];
  for (const k of Object.keys(stubs)) delete require.cache[k];

  const orig = Module._load;
  Module._load = function(request, parent, isMain) {
    const resolved = (() => {
      try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; }
    })();
    if (resolved && Object.prototype.hasOwnProperty.call(stubs, resolved)) {
      return stubs[resolved];
    }
    return orig.apply(this, arguments);
  };
  try {
    return require(filePath);
  } finally {
    Module._load = orig;
    delete require.cache[filePath];
    for (const k of Object.keys(stubs)) delete require.cache[k];
  }
}

function makeSyntheticBars(count = 6) {
  const start = Date.now() - count * 300000;
  return Array.from({ length: count }, (_, i) => makeBar(start + i * 300000, 100 + i));
}

function makeYahooStub(captured) {
  // Returns a stub for shared/lib/providers/yahoo.js that intercepts fetchYahooBaseCandles
  const bars = makeSyntheticBars(6);
  return {
    fetchYahooBaseCandles: async (symbol, interval, rangeDays, startTime, endTime) => {
      captured.push({ symbol, interval, rangeDays, startTime, endTime });
      return bars;
    },
  };
}

function loadIngestWithYahooStub(captured) {
  const yahooStub = makeYahooStub(captured);

  // We need to stub the providers barrel so fetchYahooBaseCandles is replaced.
  // The ingest index.js imports fetchYahooBaseCandles from shared/lib/providers (barrel),
  // which re-exports from shared/lib/providers/yahoo.js.
  const providersPath = path.resolve(REPO_ROOT, 'shared/lib/providers/index.js');
  const realProviders = require(providersPath);
  const stubbedProviders = {
    ...realProviders,
    fetchYahooBaseCandles: yahooStub.fetchYahooBaseCandles,
  };

  const stubs = { [providersPath]: stubbedProviders };

  delete require.cache[ingestIndexPath];
  purgeIngestModuleCache();
  for (const k of Object.keys(stubs)) delete require.cache[k];

  const orig = Module._load;
  Module._load = function(request, parent, isMain) {
    const resolved = (() => {
      try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; }
    })();
    if (resolved && Object.prototype.hasOwnProperty.call(stubs, resolved)) {
      return stubs[resolved];
    }
    return orig.apply(this, arguments);
  };
  try {
    return require(ingestIndexPath);
  } finally {
    Module._load = orig;
    delete require.cache[ingestIndexPath];
  purgeIngestModuleCache();
    for (const k of Object.keys(stubs)) delete require.cache[k];
  }
}

test('Commodity native 5m: fetchCommoditySnapshot uses 5m base for all-sub-daily timeframes', async () => {
  const captured = [];
  const ingestMod = loadIngestWithYahooStub(captured);

  const result = await ingestMod.fetchCommoditySnapshot(
    'commodities', 'yahoo', 'XAUUSD', ['5m'], {}, { historyDays: 59 },
  );

  assert.strictEqual(captured.length, 1, 'fetchYahooBaseCandles called once');
  assert.strictEqual(captured[0].interval, '5m', 'base interval must be 5m');
  assert.strictEqual(captured[0].symbol, 'GC=F', 'XAUUSD must map to GC=F');

  const fiveM = result.filter(r => r.timeframe === '5m');
  assert.ok(fiveM.length > 0, 'should produce 5m records');
  assert.ok(fiveM.every(r => r.family === 'commodities'), 'family must be commodities');

  // Native 5m pass-through: derived_from_timeframe must NOT be '1d', '1w', or '1mo'
  const DAILY_OR_ABOVE = new Set(['1d', '1w', '1mo']);
  for (const r of fiveM) {
    assert.ok(
      !r.experimental_only,
      `record should not have experimental_only set: ${JSON.stringify(r)}`,
    );
    assert.ok(
      !DAILY_OR_ABOVE.has(r.derived_from_timeframe),
      `derived_from_timeframe must not be daily/above, got: ${r.derived_from_timeframe}`,
    );
  }
});

test('Commodity behavior-freeze: legacy ternary preserved for non-all-sub-daily timeframes', async () => {
  // Case 1: ['1h','1d'] with historyDays:365 => legacy ternary => bestBase = '1h'
  const captured1 = [];
  const mod1 = loadIngestWithYahooStub(captured1);
  await mod1.fetchCommoditySnapshot('commodities', 'yahoo', 'XAUUSD', ['1h', '1d'], {}, { historyDays: 365 });
  assert.strictEqual(captured1.length, 1);
  assert.strictEqual(captured1[0].interval, '1h', 'legacy: historyDays=365 with 1h in timeframes => 1h base');

  // Case 2: ['5m','1d'] mixed — '1d' is NOT sub-daily, so allSubDaily=false => legacy ternary
  const captured2 = [];
  const mod2 = loadIngestWithYahooStub(captured2);
  await mod2.fetchCommoditySnapshot('commodities', 'yahoo', 'XAUUSD', ['5m', '1d'], {}, { historyDays: 365 });
  assert.strictEqual(captured2.length, 1);
  // Legacy ternary: historyDays=365 <= 730 AND timeframes.includes('1h')=false => '1d'
  assert.ok(
    captured2[0].interval === '1d' || captured2[0].interval === '1h',
    `mixed timeframes must use legacy base, not '5m'; got: ${captured2[0].interval}`,
  );
  assert.notStrictEqual(captured2[0].interval, '5m', 'guarded branch must NOT fire for mixed timeframes');
});

test('fetchFxSnapshot mapping: symbol resolution and 5m base selection', async () => {
  const captured = [];
  const ingestMod = loadIngestWithYahooStub(captured);

  const result = await ingestMod.fetchFxSnapshot(
    'fx', 'yahoo', 'EURUSD', ['5m'], {}, { historyDays: 59 },
  );

  assert.strictEqual(captured.length, 1);
  assert.strictEqual(captured[0].symbol, 'EURUSD=X', 'EURUSD must map to EURUSD=X');
  assert.strictEqual(captured[0].interval, '5m', 'base interval must be 5m');

  const fiveM = result.filter(r => r.timeframe === '5m');
  assert.ok(fiveM.length > 0, 'should produce 5m records');
  assert.ok(fiveM.every(r => r.family === 'fx'), 'family must be fx');

  // Unmapped symbol must reject
  const captured2 = [];
  const mod2 = loadIngestWithYahooStub(captured2);
  await assert.rejects(
    () => mod2.fetchFxSnapshot('fx', 'yahoo', 'XXXYYY', ['5m'], {}, { historyDays: 5 }),
    /No yahoo symbol mapping/,
  );
});

test('fx dispatch: fetchFxSnapshot is exported from ingest index', () => {
  delete require.cache[ingestIndexPath];
  purgeIngestModuleCache();
  const ingestMod = require(ingestIndexPath);
  delete require.cache[ingestIndexPath];
  purgeIngestModuleCache();

  assert.strictEqual(typeof ingestMod.fetchFxSnapshot, 'function', 'fetchFxSnapshot must be exported');
});
