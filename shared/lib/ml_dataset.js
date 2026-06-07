'use strict';

// ML dataset helpers: load OHLCV bars + anchor series from the local family-partitioned
// cache (storage/data/cache/<family>/backtest_history.json) and serialize a feature frame
// to CSV for Python training. Cache-only (no network); cache root is overridable for tests.

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./paths');

function defaultCacheRoot() {
  return path.join(REPO_ROOT, 'storage', 'data', 'cache');
}

function readFamilySources(cacheRoot) {
  const root = cacheRoot || defaultCacheRoot();
  const out = [];
  if (!fs.existsSync(root)) return out;
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
  return out;
}

/**
 * Loads OHLCV bar records for the requested symbols + timeframe from the cache.
 * Returns the flat record shape buildMLFeatureFrame / indicators.groupOhlcv expect.
 */
function loadAssetSourcesFromCache(symbols, timeframe = '1d', opts = {}) {
  const want = new Set((symbols || []).map((s) => String(s).toUpperCase()));
  const all = readFamilySources(opts.cacheRoot);
  const filtered = all.filter(
    (r) => r && r.symbol && r.timeframe === timeframe &&
      (want.size === 0 || want.has(String(r.symbol).toUpperCase())),
  );

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
  const all = readFamilySources(opts.cacheRoot);
  const sym = String(symbol).toUpperCase();
  const byDay = new Map();
  for (const r of all) {
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
  loadAssetSourcesFromCache,
  cacheCloseSeriesAnchor,
  frameToCsv,
};
