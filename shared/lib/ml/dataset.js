'use strict';

// ML dataset helpers: load OHLCV bars + anchor series from the local family-partitioned
// cache (storage/data/cache/<family>/backtest_history.json) AND the binary time-series
// index (storage/data/ts/<symbol>_<tf>.bin), then serialize a feature frame to CSV for
// Python training. Cache-only (no network); both roots are overridable for tests.
//
// The JSON cache only holds whatever was last written to backtest_history.json (often a
// partial set), while the binary ts index carries the full backfilled universe (core
// crypto, metals, energy, FX, equities). Reading both makes `ml dump` cover everything.

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, STORAGE_TS_DIR } = require('../runtime/paths');
const { readTsIndex } = require('../market/validation');

// Module-level cache for readFamilySources().
// Keyed by resolved cacheRoot so per-root correctness is preserved.
// TTL: 60 seconds — long-lived processes (API server, bot) revalidate periodically
// rather than serving stale data forever, while a single ml-dump invocation (< 60 s)
// pays the JSON parse cost only once regardless of how many anchor symbols are loaded.
const _familySourcesCache = new Map(); // key -> { data: Array, expireAt: number }
const _FAMILY_CACHE_TTL_MS = 60_000;

/** Evict the cache for the given root (or all roots if root is null/undefined). For tests. */
function clearFamilySourcesCache(cacheRoot) {
  if (cacheRoot == null) {
    _familySourcesCache.clear();
  } else {
    _familySourcesCache.delete(path.resolve(cacheRoot));
  }
}

function defaultCacheRoot() {
  return path.join(REPO_ROOT, 'storage', 'data', 'cache');
}

function defaultTsDir() {
  return STORAGE_TS_DIR;
}

// Enumerate the symbols present in the binary ts index for a timeframe (from `<sym>_<tf>.bin`).
function tsSymbolsForTimeframe(tsDir, timeframe) {
  const dir = tsDir || defaultTsDir();
  if (!fs.existsSync(dir)) return [];
  const suffix = `_${timeframe}.bin`;
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(suffix)) out.push(f.slice(0, -suffix.length));
  }
  return out;
}

// Read ts-index OHLCV records for the requested symbols + timeframe. Returns the same flat
// record shape as the JSON cache sources. `symbols` empty => every symbol in the ts index.
function readTsSources(symbols, timeframe, tsDir) {
  const dir = tsDir || defaultTsDir();
  const want = (symbols && symbols.length)
    ? [...new Set(symbols.map((s) => String(s).toUpperCase()))]
    : tsSymbolsForTimeframe(dir, timeframe);
  const out = [];
  for (const sym of want) {
    const recs = readTsIndex(dir, sym, timeframe);
    if (Array.isArray(recs)) out.push(...recs);
  }
  return out;
}

// Merge JSON-cache + ts-index records, deduped by symbol+timestamp (JSON wins on a tie).
function mergeSourceRecords(jsonRecords, tsRecords) {
  const seen = new Set();
  const out = [];
  const keyOf = (r) => `${String(r.symbol).toUpperCase()}\0${r.timestamp}`;
  for (const r of jsonRecords) { seen.add(keyOf(r)); out.push(r); }
  for (const r of tsRecords) {
    const k = keyOf(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function readFamilySources(cacheRoot) {
  const root = path.resolve(cacheRoot || defaultCacheRoot());
  const now = Date.now();
  const cached = _familySourcesCache.get(root);
  if (cached && now < cached.expireAt) return cached.data;

  const out = [];
  if (!fs.existsSync(root)) {
    _familySourcesCache.set(root, { data: out, expireAt: now + _FAMILY_CACHE_TTL_MS });
    return out;
  }
  for (const family of fs.readdirSync(root)) {
    const file = path.join(root, family, 'backtest_history.json');
    if (!fs.existsSync(file)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const sources = Array.isArray(data.sources) ? data.sources : [];
      for (const rec of sources) out.push(rec);
    } catch {
      // skip unreadable/partial cache file
    }
  }
  _familySourcesCache.set(root, { data: out, expireAt: now + _FAMILY_CACHE_TTL_MS });
  return out;
}

/**
 * Loads OHLCV bar records for the requested symbols + timeframe from the cache.
 * Returns the flat record shape buildMLFeatureFrame / indicators.groupOhlcv expect.
 */
function loadAssetSourcesFromCache(symbols, timeframe = '1d', opts = {}) {
  const want = new Set((symbols || []).map((s) => String(s).toUpperCase()));
  const jsonAll = readFamilySources(opts.cacheRoot);
  const jsonFiltered = jsonAll.filter(
    (r) => r && r.symbol && r.timeframe === timeframe &&
      (want.size === 0 || want.has(String(r.symbol).toUpperCase())),
  );
  // Fill the rest of the universe from the binary ts index (it carries the full backfill).
  const tsRecords = readTsSources(symbols, timeframe, opts.tsDir);
  const filtered = mergeSourceRecords(jsonFiltered, tsRecords);

  // Cap to the most recent N bars per symbol — the expanding-window feature build is
  // O(n^2), so unbounded 7000-bar histories are impractical. Default: no cap.
  const maxBars = Number(opts.maxBarsPerSymbol) || 0;
  if (maxBars <= 0) return filtered;

  const bySymbol = new Map();
  for (const r of filtered) {
    const k = String(r.symbol).toUpperCase();
    if (!bySymbol.has(k)) bySymbol.set(k, []);
    bySymbol.get(k).push(r);
  }
  const out = [];
  for (const recs of bySymbol.values()) {
    recs.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    out.push(...recs.slice(-maxBars));
  }
  return out;
}

/**
 * Builds a daily anchor level-series [{date, value}] from a cached symbol's closes
 * (one point per UTC day, last value wins). Use for metals/energy/FX cross-family anchors.
 */
function cacheCloseSeriesAnchor(symbol, timeframe = '1d', opts = {}) {
  const sym = String(symbol).toUpperCase();
  const jsonAll = readFamilySources(opts.cacheRoot);
  const byDay = new Map();
  // ts-index first, then JSON cache overrides same-day closes (JSON precedence).
  for (const r of readTsSources([sym], timeframe, opts.tsDir)) {
    if (!Number.isFinite(Number(r.close))) continue;
    byDay.set(String(r.timestamp).slice(0, 10), Number(r.close));
  }
  for (const r of jsonAll) {
    if (!r || r.timeframe !== timeframe || String(r.symbol).toUpperCase() !== sym) continue;
    if (!Number.isFinite(Number(r.close))) continue;
    byDay.set(String(r.timestamp).slice(0, 10), Number(r.close));
  }
  return [...byDay.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Columns to exclude from the numeric feature matrix (identifiers / non-features / labels).
const NON_FEATURE_KEYS = new Set([
  'key', 'symbol', 'family', 'provider', 'timeframe', 'as_of', 'bars',
  'session_volume_profile_session_key', 'smc_bias',
  'label_fwd_return', 'label_class', 'label_horizon',
]);

/**
 * Serializes a feature frame (from buildMLFeatureFrame) to CSV.
 * Columns: symbol, as_of, <numeric features...>, label_class, label_fwd_return.
 * null/non-finite -> empty cell.
 */
function frameToCsv(frame) {
  const rows = frame.features || [];
  const featureCols = new Set();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (NON_FEATURE_KEYS.has(k)) continue;
      if (typeof v === 'number') featureCols.add(k);
    }
  }
  const cols = [...featureCols].sort();
  const header = ['symbol', 'as_of', ...cols, 'label_class', 'label_fwd_return'];

  const cell = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
  const lines = [header.join(',')];
  for (const row of rows) {
    const rec = [
      String(row.symbol ?? ''),
      String(row.as_of ?? ''),
      ...cols.map((c) => cell(row[c])),
      cell(row.label_class),
      cell(row.label_fwd_return),
    ];
    lines.push(rec.join(','));
  }
  return { csv: lines.join('\n') + '\n', columns: header, rows: rows.length };
}

module.exports = {
  readFamilySources,
  readTsSources,
  tsSymbolsForTimeframe,
  loadAssetSourcesFromCache,
  cacheCloseSeriesAnchor,
  frameToCsv,
  clearFamilySourcesCache,
};
