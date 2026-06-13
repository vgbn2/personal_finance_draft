'use strict';

// `sovereign features dump` — assembles the ML training feature frame (Design B: JS is the
// single feature source) and writes it to CSV for Python training. Cross-family anchors come
// from the local cache (metals/energy/FX), the crypto-aggregates file, and FRED macro.

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('../../../../shared/lib/runtime/paths');
const { buildMLFeatureFrame } = require('../../../../shared/lib/ml/feature_builder');
const {
  loadAssetSourcesFromCache,
  cacheCloseSeriesAnchor,
  frameToCsv,
} = require('../../../../shared/lib/ml/dataset');
const { optionValue, numericOption, hasFlag } = require('../../lib/utils');

// Cache-based cross-family anchors: anchor name -> cache symbol.
const CACHE_ANCHORS = {
  GOLD: 'XAUUSD', SILVER: 'XAGUSD', COPPER: 'XCUUSD',
  OIL: 'USOIL', NATGAS: 'NG',
  EURUSD: 'EURUSD', USDJPY: 'USDJPY', GBPUSD: 'GBPUSD', AUDUSD: 'AUDUSD', USDCAD: 'USDCAD',
};
// FRED anchors: anchor name -> real FRED series id.
const FRED_ANCHORS = {
  CPI: 'CPIAUCSL', US10Y: 'DGS10', USD_BROAD: 'DTWEXBGS',
};

function fredRecordsToSeries(records) {
  return records
    .filter((r) => Number.isFinite(r.value))
    .map((r) => ({ date: String(r.timestamp).slice(0, 10), value: r.value }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Load reconstructed crypto aggregates from the cache file (written by a refresh job).
function loadCryptoAggregateAnchors(cacheRoot) {
  const file = path.join(cacheRoot || path.join(REPO_ROOT, 'storage', 'data', 'cache'), 'crypto_aggregates.json');
  if (!fs.existsSync(file)) return {};
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const out = {};
    if (Array.isArray(d.total_mcap)) out.CRYPTO_TOTAL_MCAP = d.total_mcap;
    if (Array.isArray(d.btc_dominance)) out.BTC_DOMINANCE = d.btc_dominance;
    if (Array.isArray(d.stablecoin_mcap)) out.STABLECOIN_MCAP = d.stablecoin_mcap;
    return out;
  } catch {
    return {};
  }
}

async function commandFeaturesDump(args) {
  const symbolsArg = optionValue(args, '--symbols', '');
  const symbols = symbolsArg ? symbolsArg.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const timeframe = optionValue(args, '--timeframe', '1d');
  const horizon = numericOption(args, '--horizon', 5);
  const corrPeriod = numericOption(args, '--corr-period', 20);
  const deadzone = Number(optionValue(args, '--deadzone', '0')) || 0;
  const days = numericOption(args, '--days', 1095);
  const outPath = optionValue(args, '--out', path.join(REPO_ROOT, 'storage', 'data', 'ml', 'feature_frame.csv'));
  const useFred = !hasFlag(args, '--no-fred');
  const json = hasFlag(args, '--json');
  const includeExperimentalSynthetic5m = hasFlag(args, '--include-experimental-5m');

  const maxBarsOption = numericOption(args, '--max-bars-per-symbol', 0);

  // Cap bars per symbol to the requested window (1d => ~1 bar/day). Bounds the O(n^2) build.
  let maxBarsPerSymbol = maxBarsOption;
  if (maxBarsPerSymbol <= 0) {
    if (timeframe === '1d') {
      maxBarsPerSymbol = days;
    } else {
      // Safe default cap for intraday timeframes to prevent O(n^2) scaling issues
      maxBarsPerSymbol = 50000;
    }
  }
  const assetSources = loadAssetSourcesFromCache(symbols, timeframe, { maxBarsPerSymbol, includeExperimentalSynthetic5m });
  if (assetSources.length === 0) {
    const msg = { ok: false, error: 'no_asset_sources', symbols, timeframe, hint: 'check storage/data/cache/<family>/backtest_history.json' };
    console.log(json ? JSON.stringify(msg, null, 2) : `No cached bars for symbols=[${symbols.join(',')}] timeframe=${timeframe}`);
    return 1;
  }

  // Assemble cross-family anchors.
  const anchors = {};
  const anchorReport = {};
  for (const [name, sym] of Object.entries(CACHE_ANCHORS)) {
    const series = cacheCloseSeriesAnchor(sym, timeframe, { includeExperimentalSynthetic5m });
    if (series.length > 0) { anchors[name] = series; anchorReport[name] = series.length; }
  }
  Object.assign(anchors, loadCryptoAggregateAnchors());
  for (const k of ['CRYPTO_TOTAL_MCAP', 'BTC_DOMINANCE', 'STABLECOIN_MCAP']) {
    if (anchors[k]) anchorReport[k] = anchors[k].length;
  }
  if (useFred && process.env.FRED_API_KEY) {
    const { fetchFredHistory } = require('../../../../shared/lib/providers/macro');
    for (const [name, seriesId] of Object.entries(FRED_ANCHORS)) {
      try {
        const series = fredRecordsToSeries(await fetchFredHistory(seriesId, days));
        if (series.length > 0) { anchors[name] = series; anchorReport[name] = series.length; }
      } catch (err) {
        anchorReport[name] = `error: ${err.message}`;
      }
    }
  }

  const frame = buildMLFeatureFrame({ assetSources, anchors, horizon, corrPeriod, deadzone });
  const { csv, columns, rows } = frameToCsv(frame);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csv, 'utf8');
  const metaPath = outPath.replace(/\.csv$/, '.meta.json');
  const meta = {
    out: outPath, rows, feature_columns: columns.length,
    assets: frame.meta.assets, symbols, timeframe, horizon, corr_period: corrPeriod, deadzone,
    include_experimental_5m: includeExperimentalSynthetic5m,
    anchors: anchorReport, cross_family_features: frame.feature_names,
    dropped_no_label: frame.meta.dropped_no_label, generated_at: frame.generated_at,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  if (json) {
    console.log(JSON.stringify({ ok: true, ...meta }, null, 2));
  } else {
    console.log(`Feature frame written: ${outPath}`);
    console.log(`  rows: ${rows} | columns: ${columns.length} | assets: ${frame.meta.assets}`);
    console.log(`  anchors: ${Object.keys(anchorReport).length} (${Object.entries(anchorReport).map(([k, v]) => `${k}:${v}`).join(', ')})`);
    console.log(`  cross-family feature cols: ${frame.feature_names.length}`);
    console.log(`  meta: ${metaPath}`);
  }
  return 0;
}

// Build + persist crypto aggregates (total mcap / BTC dominance / stablecoin mcap) to the
// cache file that `loadCryptoAggregateAnchors` reads. Separated from the CLI wrapper so the
// write path is unit-testable with an injected fetcher (no network).
async function refreshCryptoAggregates(opts = {}) {
  const { buildCryptoAggregateSeries } = require('../../../../shared/lib/data/crypto_aggregates');
  const cacheRoot = opts.cacheRoot || path.join(REPO_ROOT, 'storage', 'data', 'cache');
  const outPath = opts.out || path.join(cacheRoot, 'crypto_aggregates.json');

  const series = await buildCryptoAggregateSeries({
    days: opts.days,
    throttleMs: opts.throttleMs,
    universe: opts.universe,
    stablecoins: opts.stablecoins,
    fetchMcapSeries: opts.fetchMcapSeries,
  });

  const payload = {
    total_mcap: series.total_mcap,
    btc_dominance: series.btc_dominance,
    stablecoin_mcap: series.stablecoin_mcap,
    meta: { ...series.meta, generated_at: new Date().toISOString() },
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  return { out: outPath, ...payload.meta, days_emitted: series.total_mcap.length };
}

async function commandAggregatesRefresh(args) {
  const days = numericOption(args, '--days', 365);
  const throttleMs = numericOption(args, '--throttle-ms', 1500);
  const universeArg = optionValue(args, '--universe', '');
  const universe = universeArg ? universeArg.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const outPath = optionValue(args, '--out', '');
  const json = hasFlag(args, '--json');

  try {
    const result = await refreshCryptoAggregates({
      days, throttleMs, universe, out: outPath || undefined,
    });
    if (json) {
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    } else {
      console.log(`Crypto aggregates written: ${result.out}`);
      console.log(`  days_emitted: ${result.days_emitted} | coins_fetched: ${result.coins_fetched}`);
      if (Array.isArray(result.errors) && result.errors.length) {
        console.log(`  fetch errors: ${result.errors.map((e) => e.symbol).join(', ')}`);
      }
    }
    return 0;
  } catch (err) {
    const msg = { ok: false, error: 'aggregates_refresh_failed', detail: err.message };
    console.log(json ? JSON.stringify(msg, null, 2) : `Aggregates refresh failed: ${err.message}`);
    return 1;
  }
}

async function commandMl(args) {
  const sub = args[0];
  if (sub === 'dump') return commandFeaturesDump(args.slice(1));
  if (sub === 'aggregates' && args[1] === 'refresh') return commandAggregatesRefresh(args.slice(2));
  console.log('Usage:');
  console.log('  sovereign ml dump [--symbols A,B] [--timeframe 1d] [--horizon 5] [--corr-period 20] [--days 1095] [--out path] [--no-fred] [--include-experimental-5m] [--json]');
  console.log('  sovereign ml aggregates refresh [--days 365] [--throttle-ms 1500] [--universe BTC,ETH,...] [--out path] [--json]');
  return sub ? 1 : 0;
}

module.exports = { commandMl, commandFeaturesDump, commandAggregatesRefresh, refreshCryptoAggregates };

