'use strict';

/**
 * Tests for Phase 1 crypto 5m backfill changes:
 *   1. binance.js MAX_CALLS behaviour (bounded vs unbounded)
 *   2. fetchPaginated with fetchBinanceBaseCandles for deep 5m windows
 *   3. fetchCryptoSnapshot 5m native routing vs aggregation path
 *   4. commandCryptoDeepBackfill dry-run plan math
 * All tests are no-network: fetchers are injected or mocked via Module._load.
 */

const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

// ─── Path constants ────────────────────────────────────────────────────────────
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const binancePath   = path.resolve(REPO_ROOT, 'shared/lib/providers/binance.js');
const backfillPath  = path.resolve(REPO_ROOT, 'shared/lib/data/backfill.js');
const commonPath    = path.resolve(REPO_ROOT, 'shared/lib/providers/common.js');

// ingest_market_data/index.js is split across sibling files (candle_utils.js,
// manifests.js, providers/prediction.js, snapshot_fetchers.js). Those siblings bind
// their own top-level provider imports at require-time, so purging only ingestPath's
// cache entry leaves a stale (possibly differently-stubbed) sibling cached from a
// previous test. Purge the whole directory tree whenever ingestPath is purged.
const INGEST_DIR_PREFIX = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data') + path.sep;
function purgeIngestModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(INGEST_DIR_PREFIX)) delete require.cache[key];
  }
}

// ─── Helper: fresh require with optional stub map ─────────────────────────────
function freshRequire(filePath, stubs = {}) {
  // Purge target and any stub targets from cache
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build an array of synthetic Binance kline rows (raw API format) starting at startTs. */
function makeBinanceRows(startTs, count, intervalMs = 5 * 60 * 1000) {
  return Array.from({ length: count }, (_, i) => {
    const t = startTs + i * intervalMs;
    return [t, '1000', '1010', '990', '1005', '50'];
  });
}

/** Build fetchJson stub: returns `rows` once then empty array. */
function oneShotFetchJson(rowsPerCall) {
  let call = 0;
  const calls = [];
  const stub = async (_url) => {
    calls.push(_url);
    if (call < rowsPerCall.length) return rowsPerCall[call++];
    return [];
  };
  stub.calls = calls;
  return stub;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. binance.js: MAX_CALLS is 2 when startTime is provided (bounded window)
// ─────────────────────────────────────────────────────────────────────────────

test('fetchBinanceBaseCandles exits after 1 call when startTime window is fully covered', async () => {
  const now = Date.now();
  const startTs = now - 3 * 24 * 60 * 60 * 1000; // 3 days ago
  // Single call returns 864 bars (3 days × 288 bars/day); fewer than limit=1000 → natural break
  const rows = makeBinanceRows(startTs, 864);
  const fetchJsonCalls = [];
  const fetchJsonStub = async (url) => {
    fetchJsonCalls.push(url);
    return rows;
  };

  const { fetchBinanceBaseCandles } = freshRequire(binancePath, {
    [commonPath]: { fetchJson: fetchJsonStub },
  });

  const bars = await fetchBinanceBaseCandles('BTCUSDT', 1000, '5m', startTs, now);
  assert.strictEqual(fetchJsonCalls.length, 1, 'exactly 1 API call for a bounded 3-day window');
  assert.strictEqual(bars.length, 864, '864 bars returned');
  // Verify ascending order
  assert.ok(bars[0].openTime < bars[bars.length - 1].openTime, 'bars are sorted ascending');
});

test('fetchBinanceBaseCandles uses MAX_CALLS=2 guard for bounded windows (never infinite loop)', async () => {
  const now = Date.now();
  const startTs = now - 60 * 1000; // tiny 1-min window
  // Stub always returns 1 bar (pathological case that would loop forever without a cap)
  const fetchJsonStub = async () => [[now - 30 * 1000, '1000', '1010', '990', '1005', '50']];

  const { fetchBinanceBaseCandles } = freshRequire(binancePath, {
    [commonPath]: { fetchJson: fetchJsonStub },
  });

  // Should terminate (MAX_CALLS=2 for bounded) — not hang
  const bars = await fetchBinanceBaseCandles('BTCUSDT', 1000, '5m', startTs, now);
  assert.ok(bars.length >= 1, 'some bars returned');
  assert.ok(bars.length <= 2000, 'bounded by MAX_CALLS=2 × 1000 = 2000 max');
});

test('fetchBinanceBaseCandles uses higher cap (600) when no startTime (unbounded)', async () => {
  // We just verify the module loads correctly and that MAX_CALLS > 20 is accepted
  // (actual value is tested by inspection; we verify it doesn't hit the old 20-call cap
  // by counting how many calls are made for a 25-call scenario)
  const fetchJsonCalls = [];
  let callCount = 0;
  const now = Date.now();
  const batchSize = 1000;
  const fetchJsonStub = async () => {
    // Return full 1000-bar batches for first 25 calls, then empty
    callCount++;
    if (callCount <= 25) {
      const base = now - callCount * batchSize * 5 * 60 * 1000;
      return makeBinanceRows(base, batchSize);
    }
    return [];
  };

  const { fetchBinanceBaseCandles } = freshRequire(binancePath, {
    [commonPath]: { fetchJson: fetchJsonStub },
  });

  // Request 25000 bars (25 pages) — old MAX_CALLS=20 would have stopped at 20k bars
  const bars = await fetchBinanceBaseCandles('BTCUSDT', 25000, '5m', null, now);
  // With MAX_CALLS=600 (no startTime), we should get all 25 pages
  assert.ok(callCount >= 25, `expected >= 25 API calls, got ${callCount} (old 20-cap would fail here)`);
  assert.ok(bars.length >= 24000, `expected >= 24000 bars, got ${bars.length}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. fetchPaginated: correct chunk size for 5m crypto
// ─────────────────────────────────────────────────────────────────────────────

test('fetchPaginated uses 3-day chunks for 5m crypto (floor(1000/288)=3)', async () => {
  const windowsRequested = [];
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Mock fetchFn: records the time window and returns 864 bars (3d × 288) per chunk
  const mockFetchFn = async (symbol, limit, timeframe, startTs, endTs) => {
    windowsRequested.push({ startTs, endTs, limit, timeframe });
    const bars = makeBinanceRows(startTs, Math.min(limit, Math.round((endTs - startTs) / (5 * 60 * 1000))));
    return bars.map(row => ({
      openTime: row[0], open: Number(row[1]), high: Number(row[2]),
      low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]),
    }));
  };

  const { fetchPaginated } = require(backfillPath);
  const candles = await fetchPaginated('BTCUSDT', '5m', 10, 'crypto', mockFetchFn);

  // 10 days / 3-day chunks = ceil(10/3) = 4 chunks (or 3 full + 1 partial)
  assert.ok(windowsRequested.length >= 3, `expected >= 3 chunks for 10-day window, got ${windowsRequested.length}`);
  // Each chunk should request 1000 bars (providerMaxBars)
  for (const w of windowsRequested) {
    assert.strictEqual(w.limit, 1000, 'each chunk requests PROVIDER_MAX_BARS=1000');
    assert.strictEqual(w.timeframe, '5m', 'timeframe passed to fetchFn is 5m');
  }
  // Results should be sorted and deduped
  for (let i = 1; i < candles.length; i++) {
    assert.ok(candles[i].openTime >= candles[i - 1].openTime, 'candles should be sorted ascending');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. fetchCryptoSnapshot: 5m routes to native Binance, not aggregation
// ─────────────────────────────────────────────────────────────────────────────

test('fetchCryptoSnapshot routes 5m to native Binance fetch (not 1d aggregation) for historyDays > 5', async () => {
  const ingestPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/index.js');

  // We track which intervals are requested to Binance
  const binanceCalls = [];
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // fetchPaginated will call our mock fetchBinanceBaseCandles with (symbol, 1000, '5m', startTs, endTs)
  // We return 3 synthetic 5m bars per chunk to keep test fast
  const mockFetchBinanceBaseCandles = async (symbol, limit, interval, startTs, endTs) => {
    binanceCalls.push({ symbol, limit, interval, startTs, endTs });
    if (!startTs) return []; // unbounded call → no data (shouldn't happen in 5m path)
    const bars = [];
    const step = 5 * 60 * 1000;
    let t = startTs;
    let count = 0;
    while (t < endTs && count < Math.min(limit, 3)) {
      bars.push({ openTime: t, open: 100, high: 101, low: 99, close: 100.5, volume: 10 });
      t += step;
      count++;
    }
    return bars;
  };

  // Stub the providers module to inject our mock
  const providersPath = path.resolve(REPO_ROOT, 'shared/lib/providers/index.js');
  const realProviders = require(providersPath);
  const stubbedProviders = {
    ...realProviders,
    fetchBinanceBaseCandles: mockFetchBinanceBaseCandles,
  };

  // Also stub fetchPaginated to use our mock binance fn
  const backfillMod = require(backfillPath);
  const origFetchPaginated = backfillMod.fetchPaginated;

  // Monkey-patch fetchPaginated on the loaded module to capture calls through our mock
  // (Module._load stubs don't reach already-cached modules easily; use direct injection)
  backfillMod.fetchPaginated = async (symbol, timeframe, days, family, fetchFn, forcedEndTs) => {
    // Route to our mock binance fn
    return origFetchPaginated(symbol, timeframe, days, family, mockFetchBinanceBaseCandles, forcedEndTs);
  };

  try {
    // Purge ingest cache to pick up fresh stubs
    delete require.cache[ingestPath];
    purgeIngestModuleCache();
    const stubs = { [providersPath]: stubbedProviders };
    const orig = Module._load;
    Module._load = function(request, parent, isMain) {
      const resolved = (() => { try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; } })();
      if (resolved && stubs[resolved]) return stubs[resolved];
      return orig.apply(this, arguments);
    };
    let ingestMod;
    try {
      ingestMod = require(ingestPath);
    } finally {
      Module._load = orig;
      delete require.cache[ingestPath];
    purgeIngestModuleCache();
    }

    const result = await ingestMod.fetchCryptoSnapshot('binance', 'BTCUSDT', ['5m', '1d'], 'crypto', { historyDays: 30 });

    // Key assertion: we got 5m records (not synthetic 1-bar-per-day aggregates)
    const fiveMRecords = result.filter(r => r.timeframe === '5m');
    assert.ok(fiveMRecords.length > 0, 'fetchCryptoSnapshot should return 5m records via native fetch');

    // Verify all returned 5m records have correct timeframe
    for (const r of fiveMRecords) {
      assert.strictEqual(r.timeframe, '5m', 'all 5m records should have timeframe=5m');
      assert.ok(r.timestamp, 'each 5m record should have a timestamp');
      assert.ok(typeof r.open === 'number', 'open should be a number');
    }

    // Verify Binance was called with '5m' interval (not '1d')
    const fiveMBinanceCalls = binanceCalls.filter(c => c.interval === '5m');
    assert.ok(fiveMBinanceCalls.length > 0, 'Binance should have been called with interval=5m');
  } finally {
    // Restore original fetchPaginated
    backfillMod.fetchPaginated = origFetchPaginated;
  }
});

test('fetchCryptoSnapshot still produces 1d aggregated records alongside native 5m', async () => {
  const ingestPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/index.js');
  const providersPath = path.resolve(REPO_ROOT, 'shared/lib/providers/index.js');
  const backfillMod = require(backfillPath);
  const origFetchPaginated = backfillMod.fetchPaginated;

  const now = Date.now();

  // 5m mock: returns 3 bars per chunk
  const mock5mFetch = async (symbol, limit, interval, startTs, endTs) => {
    if (!startTs) return [];
    const bars = [];
    let t = startTs;
    for (let i = 0; i < 3 && t < endTs; i++) {
      bars.push({ openTime: t, open: 200, high: 202, low: 198, close: 201, volume: 5 });
      t += 5 * 60 * 1000;
    }
    return bars;
  };

  // 1d mock: returns 30 daily bars
  const mock1dFetch = async (symbol, limit, interval, startTs, endTs) => {
    if (interval !== '1d') return mock5mFetch(symbol, limit, interval, startTs, endTs);
    const bars = [];
    for (let i = 0; i < 30; i++) {
      bars.push({ openTime: now - (30 - i) * 24 * 60 * 60 * 1000, open: 100, high: 110, low: 90, close: 105, volume: 1000 });
    }
    return bars;
  };

  const realProviders = require(providersPath);
  const stubbedProviders = { ...realProviders, fetchBinanceBaseCandles: mock1dFetch };

  backfillMod.fetchPaginated = async (symbol, timeframe, days, family, fetchFn, forcedEndTs) => {
    return origFetchPaginated(symbol, timeframe, days, family, mock5mFetch, forcedEndTs);
  };

  try {
    delete require.cache[ingestPath];
    purgeIngestModuleCache();
    const stubs = { [providersPath]: stubbedProviders };
    const orig = Module._load;
    Module._load = function(request, parent, isMain) {
      const resolved = (() => { try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; } })();
      if (resolved && stubs[resolved]) return stubs[resolved];
      return orig.apply(this, arguments);
    };
    let ingestMod;
    try {
      ingestMod = require(ingestPath);
    } finally {
      Module._load = orig;
      delete require.cache[ingestPath];
    purgeIngestModuleCache();
    }

    const result = await ingestMod.fetchCryptoSnapshot('binance', 'BTCUSDT', ['5m', '1d'], 'crypto', { historyDays: 30 });

    const fiveMRecords = result.filter(r => r.timeframe === '5m');
    const oneDRecords  = result.filter(r => r.timeframe === '1d');
    assert.ok(fiveMRecords.length > 0, 'should have 5m records from native fetch');
    assert.ok(oneDRecords.length > 0, 'should also have 1d records from daily base fetch');
  } finally {
    backfillMod.fetchPaginated = origFetchPaginated;
  }
});

test('fetchCryptoSnapshot falls back to 1d aggregation when provider is coingecko (no native 5m)', async () => {
  const ingestPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/index.js');
  const providersPath = path.resolve(REPO_ROOT, 'shared/lib/providers/index.js');

  const now = Date.now();
  const coingeckoCandles = Array.from({ length: 30 }, (_, i) => ({
    openTime: now - (30 - i) * 24 * 60 * 60 * 1000,
    open: 1000, high: 1010, low: 990, close: 1005, volume: 50,
  }));

  const realProviders = require(providersPath);
  const stubbedProviders = {
    ...realProviders,
    fetchCoinGeckoBaseCandles: async () => coingeckoCandles,
  };

  delete require.cache[ingestPath];
    purgeIngestModuleCache();
  const stubs = { [providersPath]: stubbedProviders };
  const orig = Module._load;
  Module._load = function(request, parent, isMain) {
    const resolved = (() => { try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; } })();
    if (resolved && stubs[resolved]) return stubs[resolved];
    return orig.apply(this, arguments);
  };
  let ingestMod;
  try {
    ingestMod = require(ingestPath);
  } finally {
    Module._load = orig;
    delete require.cache[ingestPath];
    purgeIngestModuleCache();
  }

  // coingecko provider → falls through to aggregation path (no native 5m)
  const result = await ingestMod.fetchCryptoSnapshot('coingecko', 'BTCUSDT', ['5m', '1d'], 'crypto', { historyDays: 30 });
  const fiveMRecords = result.filter(r => r.timeframe === '5m');
  // Aggregation from 30 daily bars produces 30 synthetic 5m bars (1 per day)
  assert.ok(fiveMRecords.length > 0, 'coingecko path should still produce 5m records via aggregation');
  // They should be 1-per-day (since coingecko is daily only)
  assert.ok(fiveMRecords.length <= 30, 'coingecko 5m records should not exceed daily bar count');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. JSON cap + ts-index depth: cap applies to JSON writes only
// ─────────────────────────────────────────────────────────────────────────────

test('fetchCryptoSnapshot returns FULL 5m depth (cap is applied at JSON-write time, not in the snapshot)', async () => {
  const ingestPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/index.js');
  const backfillMod = require(backfillPath);
  const origFetchPaginated = backfillMod.fetchPaginated;

  const now = Date.now();
  const historyDays = 180; // 6 months requested — beyond the 90-day JSON cap

  // 360 bars spaced 12h apart spanning the full 180-day window
  const mockBars = Array.from({ length: historyDays * 2 }, (_, i) => ({
    openTime: now - (historyDays * 2 - i) * 12 * 60 * 60 * 1000,
    open: 100, high: 101, low: 99, close: 100, volume: 1,
  }));

  backfillMod.fetchPaginated = async () => [...mockBars];

  try {
    delete require.cache[ingestPath];
    purgeIngestModuleCache();
    const ingestMod = require(ingestPath);

    const result = await ingestMod.fetchCryptoSnapshot('binance', 'BTCUSDT', ['5m'], 'crypto', { historyDays });
    const fiveMRecords = result.filter(r => r.timeframe === '5m');

    // The snapshot must contain bars OLDER than 90 days — full depth feeds the ts-index.
    const cutoff = now - 90 * 24 * 60 * 60 * 1000;
    const olderThanCap = fiveMRecords.filter(r => new Date(r.timestamp).getTime() < cutoff);
    assert.ok(olderThanCap.length > 0,
      'snapshot should retain 5m records older than the 90-day JSON cap (cap is JSON-write-only)');
    assert.ok(fiveMRecords.length >= historyDays * 2 - 1, 'no depth lost in the snapshot');
  } finally {
    backfillMod.fetchPaginated = origFetchPaginated;
    delete require.cache[ingestPath];
    purgeIngestModuleCache();
  }
});

test('capSubDailyJsonView drops sub-daily records older than 90 days and keeps daily untouched', () => {
  const ingestPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/index.js');
  const { capSubDailyJsonView } = require(ingestPath);

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const mk = (timeframe, ageDays) => ({
    family: 'crypto', provider: 'binance', symbol: 'BTCUSDT', timeframe,
    timestamp: new Date(now - ageDays * DAY_MS).toISOString(),
    open: 1, high: 1, low: 1, close: 1, volume: 1,
  });

  const snapshot = {
    mode: 'test',
    sources: [
      mk('5m', 10),   // recent sub-daily → kept
      mk('5m', 200),  // old sub-daily → dropped
      mk('30m', 200), // old sub-daily → dropped
      mk('1h', 200),  // 1h is above the 30m cap class → kept
      mk('1d', 400),  // daily → kept regardless of age
    ],
  };

  const view = capSubDailyJsonView(snapshot);
  const tfs = view.sources.map(r => `${r.timeframe}@${Math.round((now - new Date(r.timestamp).getTime()) / DAY_MS)}d`);
  assert.deepStrictEqual(tfs, ['5m@10d', '1h@200d', '1d@400d'], `unexpected capped view: ${tfs}`);
  // Original snapshot must not be mutated
  assert.strictEqual(snapshot.sources.length, 5, 'input snapshot must not be mutated');
});

test('writeTsIndex merges sub-daily bins (shallow snapshot cannot truncate a deep backfill)', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const { writeTsIndex, readTsIndex } = require(path.resolve(REPO_ROOT, 'shared/lib/market/validation.js'));

  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts5m-'));
  try {
    const now = Date.now();
    const mk = (i, tf, stepMs) => ({
      family: 'crypto', provider: 'binance', symbol: 'BTCUSDT', timeframe: tf,
      timestamp: new Date(now - i * stepMs).toISOString(),
      open: 1, high: 2, low: 0.5, close: 1.5, volume: i,
    });

    // Deep write: 1,000 5m bars + 100 1d bars
    const FIVE_MS = 5 * 60 * 1000;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const deep5m = Array.from({ length: 1000 }, (_, i) => mk(i + 50, '5m', FIVE_MS));
    const deep1d = Array.from({ length: 100 }, (_, i) => mk(i + 5, '1d', DAY_MS));
    writeTsIndex(tsDir, { sources: [...deep5m, ...deep1d] });
    assert.strictEqual(readTsIndex(tsDir, 'BTCUSDT', '5m').length, 1000, 'deep 5m bin written');

    // Shallow write: 10 NEW recent 5m bars + 10 recent 1d bars (rebuild-from-capped-JSON scenario)
    const shallow5m = Array.from({ length: 10 }, (_, i) => mk(i, '5m', FIVE_MS));
    const shallow1d = Array.from({ length: 10 }, (_, i) => mk(i, '1d', DAY_MS));
    writeTsIndex(tsDir, { sources: [...shallow5m, ...shallow1d] });

    const after5m = readTsIndex(tsDir, 'BTCUSDT', '5m');
    assert.strictEqual(after5m.length, 1010, '5m bin merged: deep 1000 preserved + 10 new');
    // Daily is now merge-protected too: a shallow rebuild (deep daily lives only in
    // the bin, never in the capped JSON partition) must NOT truncate it. Regression
    // guard for the 1d->1-bar truncation found 2026-06-13.
    // deep1d spans day-offsets 5..104, shallow1d spans 0..9 -> 5-bar overlap -> 105 distinct.
    const after1d = readTsIndex(tsDir, 'BTCUSDT', '1d');
    assert.strictEqual(after1d.length, 105, '1d bin merged: deep preserved + new, union of distinct timestamps (no truncation)');
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});

test('fetchCryptoSnapshot survives a >150k-bar native fetch without RangeError', async () => {
  const ingestPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/index.js');
  const backfillMod = require(backfillPath);
  const origFetchPaginated = backfillMod.fetchPaginated;

  const now = Date.now();
  const FIVE_MS = 5 * 60 * 1000;
  const COUNT = 160000;
  const bigBars = Array.from({ length: COUNT }, (_, i) => ({
    openTime: now - (COUNT - i) * FIVE_MS,
    open: 1, high: 1, low: 1, close: 1, volume: 1,
  }));

  backfillMod.fetchPaginated = async () => bigBars;

  try {
    delete require.cache[ingestPath];
    purgeIngestModuleCache();
    const ingestMod = require(ingestPath);
    const result = await ingestMod.fetchCryptoSnapshot('binance', 'BTCUSDT', ['5m'], 'crypto', { historyDays: 600 });
    const fiveM = result.filter(r => r.timeframe === '5m');
    assert.ok(fiveM.length > 150000, `expected >150k records, got ${fiveM.length} (spread-args would RangeError here)`);
  } finally {
    backfillMod.fetchPaginated = origFetchPaginated;
    delete require.cache[ingestPath];
    purgeIngestModuleCache();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. commandCryptoDeepBackfill: dry-run plan math
// Tests use an async wrapper that keeps stubs active across the entire command execution
// (including lazy require() calls inside the command body).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs commandCryptoDeepBackfill with stubs active throughout the entire call.
 * The command does lazy require() inside its body, so we must hold the stub active
 * until the async command resolves — not just during module load.
 */
async function runDeepBackfillWithStubs(cmdArgs, fakeConfig, snapshotFactory = null) {
  const dataPath   = path.resolve(REPO_ROOT, 'backend/cli/commands/data/data.js');
  const ingestPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data.js');
  const utilsPath  = path.resolve(REPO_ROOT, 'backend/cli/lib/utils.js');

  const ingestStub = async (...args) => (
    snapshotFactory ? snapshotFactory(...args) : { sources: [], errors: [], mode: 'test' }
  );
  ingestStub.loadConfig    = async () => fakeConfig;
  ingestStub.ingestMarketData = ingestStub;

  const outputs = [];
  const realUtils = require(utilsPath);
  const utilsStub = { ...realUtils, printPayload: (payload) => outputs.push(payload) };

  const stubs = { [ingestPath]: ingestStub, [utilsPath]: utilsStub };

  // Keep stubs active for the entire async execution (not just module load)
  const orig = Module._load;
  Module._load = function(request, parent, isMain) {
    const resolved = (() => { try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; } })();
    if (resolved && stubs[resolved]) return stubs[resolved];
    return orig.apply(this, arguments);
  };

  // Purge data module so it reloads under the stub
  delete require.cache[dataPath];
  const dataMod = require(dataPath);

  try {
    await dataMod.commandCryptoDeepBackfill(cmdArgs);
  } finally {
    Module._load = orig;
    delete require.cache[dataPath];
    delete require.cache[ingestPath];
    purgeIngestModuleCache();
  }
  return outputs;
}

test('commandCryptoDeepBackfill dry-run reports correct symbol count and days', async () => {
  const fakeConfig = {
    crypto: { symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'], timeframes: ['5m', '1d'] },
    equities: { symbols: [] }, indices: { symbols: [] },
    commodities: { symbols: [] }, fx: { symbols: [] },
  };

  const outputs = await runDeepBackfillWithStubs(['--days', '1825', '--dry-run'], fakeConfig);

  assert.ok(outputs.length > 0, 'should emit a printPayload call');
  const out = outputs[0];
  assert.strictEqual(out.dry_run, true, 'dry_run flag should be true');
  assert.strictEqual(out.symbols, 3, 'should report 3 symbols');
  assert.strictEqual(out.days, 1825, 'should report 1825 days');
  assert.ok(Array.isArray(out.symbol_list), 'symbol_list should be an array');
  assert.deepStrictEqual(out.symbol_list, ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  assert.ok(out.estimated_api_calls > 0, 'should estimate api calls > 0');
});

test('commandCryptoDeepBackfill rejects --days <= 5 (legacy aggregation path would synthesize fake 5m bars)', async () => {
  const fakeConfig = {
    crypto: { symbols: ['BTCUSDT'], timeframes: ['5m', '1d'] },
    equities: { symbols: [] }, indices: { symbols: [] },
    commodities: { symbols: [] }, fx: { symbols: [] },
  };

  const outputs = await runDeepBackfillWithStubs(['--days', '3'], fakeConfig);
  assert.ok(outputs.length > 0, 'should emit a printPayload call');
  assert.strictEqual(outputs[0].ok, false, 'days <= 5 must be rejected');
  assert.match(String(outputs[0].error), /--days > 5/, 'error should explain the > 5 requirement');
});

test('appendRecords absorbs >200k records without RangeError (provider-loop spread regression)', () => {
  const ingestPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/index.js');
  const { appendRecords } = require(ingestPath);

  const COUNT = 250000; // a 5y 5m backfill is ~525k; 250k is past the V8 spread-args limit
  const big = Array.from({ length: COUNT }, (_, i) => i);
  const target = [-1];
  appendRecords(target, big);
  assert.strictEqual(target.length, COUNT + 1, 'all records appended');
  assert.strictEqual(target[0], -1, 'existing elements preserved');
  assert.strictEqual(target[COUNT], COUNT - 1, 'order preserved');
});

test('commandCryptoDeepBackfill fails the run when a symbol yields zero bars with ingest errors', async () => {
  const fakeConfig = {
    crypto: { symbols: ['BTCUSDT'], timeframes: ['5m', '1d'] },
    equities: { symbols: [] }, indices: { symbols: [] },
    commodities: { symbols: [] }, fx: { symbols: [] },
  };

  // Reproduces the silent-failure shape: ingest swallows a provider exception
  // (e.g. the pre-fix push(...records) RangeError) and returns an empty
  // snapshot with errors. The command must NOT report ok:true / exit 0.
  const outputs = await runDeepBackfillWithStubs(['--days', '1825'], fakeConfig, () => ({
    sources: [],
    errors: [{ provider: 'binance', symbol: 'BTCUSDT', family: 'crypto', message: 'Maximum call stack size exceeded' }],
    mode: 'test',
  }));

  const out = outputs[0];
  assert.strictEqual(out.ok, false, 'run must not report silent success');
  assert.strictEqual(out.symbol_results[0].ok, false, 'symbol must be marked failed');
  assert.match(String(out.symbol_results[0].error), /call stack/, 'symbol entry carries the error');
  assert.ok((out.error_messages || []).some(m => /call stack/.test(m)), 'payload surfaces error messages');
});

test('commandCryptoDeepBackfill dry-run with --symbol filters to single symbol', async () => {
  const fakeConfig = {
    crypto: { symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'], timeframes: ['5m', '1d'] },
    equities: { symbols: [] }, indices: { symbols: [] },
    commodities: { symbols: [] }, fx: { symbols: [] },
  };

  const outputs = await runDeepBackfillWithStubs(['--symbol', 'BTCUSDT', '--days', '365', '--dry-run'], fakeConfig);

  const out = outputs[0];
  assert.strictEqual(out.symbols, 1, 'should report 1 symbol when --symbol is specified');
  assert.deepStrictEqual(out.symbol_list, ['BTCUSDT']);
  assert.strictEqual(out.days, 365);
});

test('fetchCryptoSnapshot routes 5m to native Coinbase fetch when provider is coinbase', async () => {
  const ingestPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/index.js');

  const coinbaseCalls = [];
  const binanceCalls = [];

  const mockFetchCoinbaseBaseCandles = async (symbol, limit, interval, startTs, endTs) => {
    coinbaseCalls.push({ symbol, limit, interval, startTs, endTs });
    return [{ openTime: startTs, open: 100, high: 101, low: 99, close: 100.5, volume: 10 }];
  };

  const mockFetchBinanceBaseCandles = async (symbol, limit, interval, startTs, endTs) => {
    binanceCalls.push({ symbol, limit, interval, startTs, endTs });
    return [{ openTime: startTs, open: 100, high: 101, low: 99, close: 100.5, volume: 10 }];
  };

  // Stub the providers module to inject our mocks
  const providersPath = path.resolve(REPO_ROOT, 'shared/lib/providers/index.js');
  const realProviders = require(providersPath);
  const stubbedProviders = {
    ...realProviders,
    fetchCoinbaseBaseCandles: mockFetchCoinbaseBaseCandles,
    fetchBinanceBaseCandles: mockFetchBinanceBaseCandles,
  };

  // Stub fetchPaginated
  const backfillMod = require(backfillPath);
  const origFetchPaginated = backfillMod.fetchPaginated;

  backfillMod.fetchPaginated = async (symbol, timeframe, days, family, fetchFn, forcedEndTs) => {
    return origFetchPaginated(symbol, timeframe, days, family, fetchFn, forcedEndTs);
  };

  try {
    delete require.cache[ingestPath];
    purgeIngestModuleCache();
    const stubs = { [providersPath]: stubbedProviders };
    const orig = Module._load;
    Module._load = function(request, parent, isMain) {
      const resolved = (() => { try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; } })();
      if (resolved && stubs[resolved]) return stubs[resolved];
      return orig.apply(this, arguments);
    };
    let ingestMod;
    try {
      ingestMod = require(ingestPath);
    } finally {
      Module._load = orig;
      delete require.cache[ingestPath];
    purgeIngestModuleCache();
    }

    const result = await ingestMod.fetchCryptoSnapshot('coinbase', 'BTCUSDT', ['5m', '1d'], 'crypto', { historyDays: 30 });

    assert.strictEqual(coinbaseCalls.length > 0, true, 'Coinbase fetcher should be called');
    assert.strictEqual(binanceCalls.length, 0, 'Binance fetcher should NOT be called');
  } finally {
    backfillMod.fetchPaginated = origFetchPaginated;
  }
});

