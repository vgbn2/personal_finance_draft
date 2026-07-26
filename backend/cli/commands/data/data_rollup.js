'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { writeTsIndex, readTsIndex, readTsIndexSince, mergeWriteBin, recordKey } = require('../../../../shared/lib/market/validation.js');
const {
  FAMILY_BASE_TIMEFRAME: FAMILY_BASE_TF,
} = require('../../../../shared/lib/market/configured_universe.js');
const utils = require('../../lib/utils.js');
const { optionValue, numericOption, hasFlag, withLoadingAnimation, printPayload } = utils;

const DEFAULT_TS_DIR = path.join(utils.REPO_ROOT, 'storage', 'data', 'ts');

// ─── intraday-rollup: derive coarser intraday bins from the finest native bin ───
// All intraday timeframes, finest → coarsest. The base grain is whichever finest
// bin a family stores natively (1m for crypto/equities, 5m for Yahoo families).
const INTRADAY_TF_ORDER = ['1m', '5m', '15m', '30m', '1h', '4h'];

// Full canonical ladder, finest → coarsest, including daily/weekly/monthly. This is
// the default rollup chain: ingest the base grain, derive everything above it. The
// stage split (intraday/daily from base vs weekly/monthly from the 1d bin) lives in
// rollupFromBase; custom timeframes (2h/6h/3d…) are routed there by parsed interval.
const FULL_TF_ORDER = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1mo'];

// Per-family base (finest natively-fetched) grain. Crypto (Binance) and US equities
// (Alpaca SIP) serve deep 1m; Yahoo families (indices/commodities/fx) only get ~7d
// of 1m so they stay on a 5m base (Yahoo serves ~60d of 5m).
// Coarser targets to derive from a given base grain — everything above it on the
// full ladder (intraday + 1d + 1w + 1mo). An unknown base falls back to "from 15m up".
function rollupTargetsAboveBase(baseTf) {
  const i = FULL_TF_ORDER.indexOf(baseTf);
  if (i < 0) return FULL_TF_ORDER.slice(FULL_TF_ORDER.indexOf('15m'));
  return FULL_TF_ORDER.slice(i + 1);
}

// Enumerate symbols that have a deep `<symbol>_<baseTf>.bin` in the ts index.
function listDeepSymbols(tsDir, baseTf = '5m') {
  let files;
  try { files = fs.readdirSync(tsDir); } catch (_) { return []; }
  const suffix = `_${baseTf}.bin`;
  return files.filter((f) => f.endsWith(suffix)).map((f) => f.slice(0, -suffix.length));
}

// Back-compat wrapper: 5m-base enumeration (existing intraday-rollup callers).
function listDeepFiveMinSymbols(tsDir) {
  return listDeepSymbols(tsDir, '5m');
}

// Read just the tiny meta sidecar to gate by family without loading the big bin.
function readBinFamily(tsDir, symbol, baseTf = '5m') {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(tsDir, `${symbol}_${baseTf}.meta.json`), 'utf8'));
    return String(meta.family || '').toLowerCase();
  } catch (_) { return null; }
}

// Back-compat wrapper.
function readFiveMinBinFamily(tsDir, symbol) {
  return readBinFamily(tsDir, symbol, '5m');
}

// Derive coarser intraday bins for one symbol from its deep `baseTf` bin. Lossless:
// the base bin is read-only; coarser bins are written merge-protected. Shared by
// `intraday-rollup`, the deep-backfill commands, and the backfill daemon.
/**
 * writeDeadSymbolMarker(tsDir, symbol, timeframe, family, provider) -- record a "no data on
 * provider" marker so the backfill daemon skips a delisted/never-listed symbol for 7 days
 * (DEAD_SYMBOL_TTL_MS in coverage.js) instead of re-deep-backfilling it every cycle.
 *
 * GUARD: the marker is written ONLY when no real `.bin` exists for (symbol, timeframe). A 0-bar
 * result for a symbol that already has bars is a transient provider failure (outage/429/empty
 * page), NOT a delisting — writing the stripped marker over a real `.meta.json` sidecar would
 * clobber coordinate_id, config_market/config_sector and derived_from for the retained bars
 * (readCoverage ignores the marker whenever a bin is present, so it would be harmful, not useless).
 *
 * @returns {boolean} true if a marker was written, false if skipped (bin present) or on error.
 */
function writeDeadSymbolMarker(tsDir, symbol, timeframe, family, provider) {
  try {
    const fsSync = require('node:fs');
    const safe = String(symbol).replace(/[^a-zA-Z0-9_]/g, '_');
    const binPath = path.join(tsDir, `${safe}_${timeframe}.bin`);
    if (fsSync.existsSync(binPath)) return false; // real bars present — never clobber the sidecar
    fsSync.mkdirSync(tsDir, { recursive: true });
    fsSync.writeFileSync(
      path.join(tsDir, `${safe}_${timeframe}.meta.json`),
      JSON.stringify({ symbol, timeframe, family, provider, count: 0, last_checked: Date.now() }),
      'utf8',
    );
    return true;
  } catch (_) {
    return false; // non-fatal: the daemon will just re-probe next cycle
  }
}

// Delete a (symbol, timeframe) bin + meta so the next write is a clean rebuild rather
// than a merge. Used for weekly/monthly/N-day bins, which are pure derived caches of the
// 1d bin — a clean rebuild lets a bucket-boundary change (e.g. Thursday→Monday weeks)
// replace stale mis-aligned bars instead of accumulating duplicates.
function removeDerivedBin(tsDir, symbol, timeframe) {
  const safe = String(symbol).replace(/[^a-zA-Z0-9_]/g, '_');
  for (const ext of ['bin', 'meta.json']) {
    try { fs.unlinkSync(path.join(tsDir, `${safe}_${timeframe}.${ext}`)); } catch (_) { /* absent — fine */ }
  }
}

const ROLLUP_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * rollupFromBase(tsDir, symbol, baseTf, timeframes, opts)
 *
 * Derives coarser bins from a symbol's data by local OHLCV aggregation. Two stages so
 * weekly/monthly stay correct and off the heap:
 *
 *   Stage 1 (interval <= 1d): aggregated from the intraday BASE bin and merge-written
 *     (lossless; new-wins-on-timestamp). Honors opts.sinceMs — when finite, only base
 *     bars at/after sinceMs are read (windowed incremental), instead of the whole
 *     possibly-multi-million-row base bin. sinceMs MUST be UTC-day aligned so daily and
 *     dividing-sub-day buckets in the window are whole.
 *   Stage 2 (interval > 1d, e.g. 1w/1mo/3d): aggregated from the (now-updated) small 1d
 *     bin — read in FULL regardless of sinceMs (thousands of rows, no OOM) and
 *     clean-REBUILT, so a day-aligned incremental window can never leave a partial
 *     weekly/monthly bar behind. Calendar-correct via aggregateCandles/bucketStartFor.
 *
 * Custom timeframes are routed by parsed interval, so 8h behaves like 4h (from base) and
 * 3d behaves like 1w (from the 1d bin) with no special-casing.
 */
function rollupFromBase(tsDir, symbol, baseTf, timeframes, opts = {}) {
  const { aggregateCandles } = require('../../../scripts/data_ops/ingest_market_data.js');
  const { parseTimeframeMs } = require('../../../scripts/data_ops/ingest_market_data/constants.js');
  const sinceMs = Number.isFinite(opts.sinceMs) ? opts.sinceMs : null;

  // Route each target by its span: <= 1d from the base bin, > 1d from the daily bin.
  const fromBase = [];
  const fromDaily = [];
  for (const tf of timeframes) {
    const ms = parseTimeframeMs(tf);
    if (ms == null) continue; // un-parseable target — skip
    (ms > ROLLUP_DAY_MS ? fromDaily : fromBase).push(tf);
  }

  const tfCounts = {};
  let sourceBars = 0;
  const toCandles = (records) => records.map((r) => ({
    openTime: Date.parse(r.timestamp),
    open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
  }));

  // ── Stage 1: intraday + daily, from the base bin (windowed when sinceMs set) ──
  if (fromBase.length > 0) {
    const baseRecords = sinceMs !== null
      ? readTsIndexSince(tsDir, symbol, baseTf, sinceMs)
      : readTsIndex(tsDir, symbol, baseTf);
    if (!baseRecords || baseRecords.length === 0) {
      if (fromDaily.length === 0) {
        return { ok: false, error: `no readable ${baseTf} bin`, source_bars: 0, base_timeframe: baseTf, derived: {} };
      }
    } else {
      sourceBars = baseRecords.length;
      const provider = baseRecords[0].provider || 'rollup';
      const family = baseRecords[0].family || 'unknown';
      const candles = toCandles(baseRecords);
      const derivedSources = [];
      for (const tf of fromBase) {
        const derived = aggregateCandles(candles, tf, symbol, provider, family, { sourceTimeframe: baseTf });
        tfCounts[tf] = derived.length;
        for (const rec of derived) derivedSources.push(rec);
      }
      if (derivedSources.length > 0) writeTsIndex(tsDir, { sources: derivedSources });
    }
  }

  // ── Stage 2: weekly/monthly/N-day, clean-rebuilt from the full 1d bin ──
  if (fromDaily.length > 0) {
    const dailyRecords = readTsIndex(tsDir, symbol, '1d');
    if (dailyRecords && dailyRecords.length > 0) {
      const provider = dailyRecords[0].provider || 'rollup';
      const family = dailyRecords[0].family || 'unknown';
      const dailyCandles = toCandles(dailyRecords);
      for (const tf of fromDaily) {
        const derived = aggregateCandles(dailyCandles, tf, symbol, provider, family, { sourceTimeframe: '1d' });
        tfCounts[tf] = derived.length;
        if (derived.length > 0) {
          removeDerivedBin(tsDir, symbol, tf); // clean rebuild — pure cache of 1d
          writeTsIndex(tsDir, { sources: derived });
        }
      }
    } else {
      for (const tf of fromDaily) if (!(tf in tfCounts)) tfCounts[tf] = 0;
    }
  }

  return { ok: Object.keys(tfCounts).length > 0, source_bars: sourceBars, base_timeframe: baseTf, derived: tfCounts };
}

// Back-compat wrapper: 5m-base rollup (existing deep-backfill + intraday-rollup callers).
function rollupFiveMinForSymbol(tsDir, symbol, timeframes) {
  const res = rollupFromBase(tsDir, symbol, '5m', timeframes);
  // Preserve the legacy field name used by existing callers/tests.
  return { ...res, source_5m_bars: res.source_bars || 0 };
}

const ROLLUP_TARGET_TFS = ['15m', '30m', '1h', '4h'];

/**
 * Handles 'intraday-rollup': derives every coarser timeframe from the already-deep native
 * 5m bins by local OHLCV aggregation. No network. Defaults to the full ladder above 5m
 * (15m/30m/1h/4h/1d/1w/1mo) but accepts ANY coarser custom timeframe via --timeframes
 * (e.g. 2h,6h,8h,12h,3d). Intraday/daily are merge-protected (new-wins-on-timestamp) so
 * native bars at non-overlapping timestamps survive; weekly/monthly/N-day are rebuilt
 * from the 1d bin (calendar-correct). The 5m base bin is read-only.
 *
 * Examples:
 *   sovereign data intraday-rollup --family crypto --dry-run
 *   sovereign data intraday-rollup --family crypto --timeframes 2h,6h,1w
 */
async function commandIntradayRollup(args) {
  const { parseTimeframeMs } = require('../../../scripts/data_ops/ingest_market_data/constants.js');

  const BASE_TF = '5m';
  const baseMs = parseTimeframeMs(BASE_TF);
  const tfArg = optionValue(args, '--timeframes', rollupTargetsAboveBase(BASE_TF).join(','));
  const timeframes = tfArg.split(',').map((s) => s.trim()).filter(Boolean);
  const badTf = timeframes.find((t) => {
    const ms = parseTimeframeMs(t);
    return ms == null || ms <= baseMs; // must parse AND be strictly coarser than the 5m base
  });
  if (badTf || timeframes.length === 0) {
    printPayload({ ok: false, error: `intraday-rollup --timeframes must be non-empty timeframes coarser than ${BASE_TF} (e.g. 15m,1h,4h,1d,1w,1mo,2h,6h,3d); got '${tfArg}'` }, args);
    return 1;
  }

  const rawFamily = optionValue(args, '--family', null);
  const familyFilter = (rawFamily && rawFamily.toLowerCase() !== 'all') ? rawFamily.toLowerCase() : null;
  const symbolsArg = optionValue(args, '--symbols', null);
  const explicitSymbols = symbolsArg
    ? symbolsArg.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    : null;
  const dryRun = hasFlag(args, '--dry-run');
  const tsDir = optionValue(args, '--ts-dir', DEFAULT_TS_DIR);  // overridable for tests

  let symbols = listDeepFiveMinSymbols(tsDir);
  if (explicitSymbols) symbols = symbols.filter((s) => explicitSymbols.includes(s.toUpperCase()));
  if (familyFilter) symbols = symbols.filter((s) => readFiveMinBinFamily(tsDir, s) === familyFilter);
  symbols.sort();

  if (symbols.length === 0) {
    printPayload({
      ok: false,
      error: `No symbols with a deep _5m.bin matched (family=${familyFilter || 'any'}, symbols=${explicitSymbols ? explicitSymbols.join(',') : 'all'})`,
    }, args);
    return 1;
  }

  if (dryRun) {
    printPayload({
      ok: true,
      dry_run: true,
      source_timeframe: '5m',
      timeframes,
      symbols: symbols.length,
      symbol_list: symbols,
      message: `Would derive ${timeframes.join('/')} from deep 5m bins for ${symbols.length} symbols (local aggregation, no network). 5m bins are read-only.`,
    }, args);
    return 0;
  }

  const results = { ok: 0, errors: 0 };
  const allErrors = [];
  const symbolResults = [];

  console.log(`[INTRADAY-ROLLUP] Deriving ${timeframes.join('/')} from 5m for ${symbols.length} symbols`);

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const progress = `[${i + 1}/${symbols.length}]`;
    const start = Date.now();
    try {
      const res = rollupFiveMinForSymbol(tsDir, symbol, timeframes);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      if (!res.ok) {
        results.errors++;
        allErrors.push({ symbol, message: res.error });
        symbolResults.push({ symbol, ok: false, error: res.error });
        console.error(`[VISIBILITY] ${progress} ${symbol} FAILED: ${res.error}`);
        continue;
      }
      results.ok++;
      symbolResults.push({ symbol, ok: true, source_5m_bars: res.source_5m_bars, derived: res.derived, elapsed_s: Number(elapsed) });
      const summary = timeframes.map((t) => `${t}:${res.derived[t]}`).join(' ');
      console.log(`[VISIBILITY] ${progress} ${symbol} 5m=${res.source_5m_bars} -> ${summary} (${elapsed}s)`);
    } catch (err) {
      results.errors++;
      allErrors.push({ symbol, message: err.message });
      symbolResults.push({ symbol, ok: false, error: err.message });
      console.error(`[VISIBILITY] ${progress} ${symbol} FAILED: ${err.message}`);
    }
  }

  console.log(`[VISIBILITY] intraday-rollup complete: ${results.ok} ok / ${results.errors} failed across ${symbols.length} symbols`);

  printPayload({
    ok: results.errors === 0,
    source_timeframe: '5m',
    timeframes,
    symbols: symbols.length,
    successful: results.ok,
    errors: results.errors,
    symbol_results: symbolResults,
    error_messages: [...new Set(allErrors.map((e) => e.message).filter(Boolean))].slice(0, 24),
    output: DEFAULT_TS_DIR,
  }, args);
  return results.errors === 0 ? 0 : 1;
}

module.exports = {
  DEFAULT_TS_DIR,
  INTRADAY_TF_ORDER, FULL_TF_ORDER, FAMILY_BASE_TF,
  rollupTargetsAboveBase, listDeepSymbols, listDeepFiveMinSymbols,
  readBinFamily, readFiveMinBinFamily, writeDeadSymbolMarker, removeDerivedBin,
  rollupFromBase, rollupFiveMinForSymbol, commandIntradayRollup,
};
