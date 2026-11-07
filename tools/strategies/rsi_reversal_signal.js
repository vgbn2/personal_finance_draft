'use strict';

// Bridges the RSI Signal Strength research (notebooks/research/rsi_reversal.py ->
// notebooks/signal_library.json) into a live read.
//
// The notebook backtests RSI zone crossovers per asset/timeframe/condition and exports
// only the statistically-actionable ones (DEPLOY/CAUTION, OOS-consistent) with their
// Kelly sizing, stop distance (in ATR units) and edge-confidence stats. This module does
// NOT re-run that research — it takes one documented entry, checks whether the live bar
// just produced the same RSI zone crossover the research validated, and if so returns the
// trade parameters the library prescribes (side, entry, stop, quarter-Kelly size).
//
// Mirrors the shape of ./ml_signal.js (getMlPrediction): a pure read, no order submission —
// strategies (e.g. an rsi_reversal_live.js in the spirit of ml_smoke_*.js) call this and
// decide what to do with the result.

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, STORAGE_TS_DIR } = require('../../shared/lib/runtime/paths');
const { readTsIndex } = require('../../shared/lib/market/validation');
const { rsi, atr } = require('../../shared/lib/market/indicators');
const { inferFamily, normalizeSymbol } = require('../../shared/lib/market/quote_router');

const LIBRARY_PATH = path.join(REPO_ROOT, 'notebooks', 'signal_library.json');

// Must match notebooks/research/rsi_reversal.py CONFIG — the live read has to reproduce
// the same zone definitions the backtest validated, or the "documented edge" doesn't apply.
const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
const OVERSOLD_TH = 30;
const OVERBOUGHT_TH = 70;

// (condition, entry) -> which RSI crossover the research treats as the trigger, and which
// side it trades. Both 'crossover' and 'recovery' entries are zone-boundary crossings —
// they differ only in direction (entering vs. exiting the zone). See rsi_reversal.py
// crossover_signals(): 'below' = was >= level now < level, 'above' = was <= level now > level.
const ZONE_RULES = {
  'oversold:crossover':   { threshold: OVERSOLD_TH,   direction: 'below', mode: 'long' },
  'oversold:recovery':    { threshold: OVERSOLD_TH,   direction: 'above', mode: 'long' },
  'overbought:crossover': { threshold: OVERBOUGHT_TH, direction: 'above', mode: 'short' },
  'overbought:recovery':  { threshold: OVERBOUGHT_TH, direction: 'below', mode: 'short' },
};

function loadLibrary() {
  const raw = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
  return Array.isArray(raw.signals) ? raw.signals : [];
}

// Returns only the entries the research already filtered to DEPLOY/CAUTION + OOS-consistent
// (export_signal_library() in rsi_reversal.py applies that filter before writing the file —
// this just exposes the list for a runner to iterate).
function actionableSignals() {
  return loadLibrary();
}

function findLibraryEntry(signals, { asset, timeframe, condition, entry }) {
  return signals.find((s) => s.asset === asset && s.timeframe === timeframe
    && s.condition === condition && s.entry === entry) || null;
}

function weekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const isoDay = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - isoDay);
  return d.toISOString().slice(0, 10);
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// The local ts cache only stores up to '1d' bars, but the library also has '1wk'/'1mo'
// entries (yfinance intervals). Resample daily OHLCV into calendar weeks/months so those
// entries can still be read live. Approximate vs. yfinance's own '1wk'/'1mo' grouping —
// fine for "did RSI just cross the zone boundary", not meant to reproduce the backtest.
function resampleDaily(dailyBars, timeframe) {
  const keyFn = timeframe === '1wk' ? weekKey : monthKey;
  const out = [];
  let currentKey = null;
  for (const bar of dailyBars) {
    const key = keyFn(new Date(bar.timestamp));
    if (key !== currentKey) {
      out.push({ ...bar });
      currentKey = key;
    } else {
      const group = out[out.length - 1];
      group.high = Math.max(group.high, bar.high);
      group.low = Math.min(group.low, bar.low);
      group.close = bar.close;
      group.volume += bar.volume;
      group.timestamp = bar.timestamp;
    }
  }
  return out;
}

function loadBars(cacheSymbol, timeframe) {
  if (timeframe === '1wk' || timeframe === '1mo') {
    const daily = readTsIndex(STORAGE_TS_DIR, cacheSymbol, '1d');
    return daily && daily.length ? resampleDaily(daily, timeframe) : null;
  }
  return readTsIndex(STORAGE_TS_DIR, cacheSymbol, timeframe);
}

/**
 * Checks one documented signal_library.json entry against the latest cached bars.
 *
 * @param {object} opts
 * @param {string} opts.asset      ticker as it appears in signal_library.json (e.g. 'SPY', 'BTC-USD')
 * @param {string} opts.timeframe  '1h' | '1d' | '1wk' | '1mo'
 * @param {string} opts.condition  'oversold' | 'overbought'
 * @param {string} [opts.entry]    'crossover' | 'recovery' (default 'crossover')
 *
 * Returns { ok:false, error } if the library has no actionable entry for this combo or
 * there isn't enough cached data, otherwise:
 *   { ok:true, fired, side, entry_price, stop_price, quarter_kelly, rsi_prev, rsi_curr, ... }
 * `fired` is true only on the bar where RSI crosses the documented threshold in the
 * documented direction — i.e. "the validated setup just occurred", not "RSI is in the zone".
 */
function getRsiReversalSignal({ asset, timeframe, condition, entry = 'crossover' }) {
  const rule = ZONE_RULES[`${condition}:${entry}`];
  if (!rule) {
    return { ok: false, error: `unknown condition/entry combo '${condition}:${entry}'` };
  }

  const libEntry = findLibraryEntry(loadLibrary(), { asset, timeframe, condition, entry });
  if (!libEntry) {
    return { ok: false, error: `'${asset}' ${timeframe} ${condition}/${entry} is not an actionable (DEPLOY/CAUTION) entry in ${LIBRARY_PATH}` };
  }

  const family = inferFamily(asset);
  const cacheSymbol = normalizeSymbol(asset, family);
  const bars = loadBars(cacheSymbol, timeframe);
  if (!bars || bars.length < RSI_PERIOD + 2) {
    return { ok: false, error: `not enough cached '${timeframe}' bars for ${asset} (looked up as '${cacheSymbol}' in ${STORAGE_TS_DIR})` };
  }

  const closes = bars.map((b) => b.close);
  const rsiPrev = rsi(closes.slice(0, -1), RSI_PERIOD);
  const rsiCurr = rsi(closes, RSI_PERIOD);
  if (rsiPrev === null || rsiCurr === null) {
    return { ok: false, error: `RSI(${RSI_PERIOD}) needs more history than is cached for ${asset} ${timeframe}` };
  }

  const fired = rule.direction === 'below'
    ? (rsiCurr < rule.threshold && rsiPrev >= rule.threshold)
    : (rsiCurr > rule.threshold && rsiPrev <= rule.threshold);

  const lastBar = bars[bars.length - 1];
  const atrValue = atr(bars, ATR_PERIOD);
  const entryPrice = lastBar.close;
  const stopDistance = (atrValue !== null && typeof libEntry.mae_95_atr === 'number')
    ? atrValue * libEntry.mae_95_atr
    : null;
  const stopPrice = stopDistance === null
    ? null
    : (rule.mode === 'long' ? entryPrice - stopDistance : entryPrice + stopDistance);

  return {
    ok: true,
    fired,
    asset,
    cache_symbol: cacheSymbol,
    timeframe,
    condition,
    entry,
    side: rule.mode === 'long' ? 'buy' : 'sell',
    as_of: lastBar.timestamp,
    rsi_prev: rsiPrev,
    rsi_curr: rsiCurr,
    threshold: rule.threshold,
    entry_price: entryPrice,
    atr: atrValue,
    stop_price: stopPrice,
    quarter_kelly: libEntry.quarter_kelly,
    p_net_pos: libEntry.p_net_pos,
    trust: libEntry.trust,
    verdict: libEntry.verdict,
    oos_str: libEntry.oos_str,
  };
}

module.exports = {
  getRsiReversalSignal, actionableSignals, LIBRARY_PATH, loadBars,
};
