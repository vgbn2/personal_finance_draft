'use strict';

/**
 * intraday_yahoo.js — Native-poll intraday fetch for Yahoo Finance.
 *
 * FW3: Supports 15m, 30m, 1h (and 4h via 1h aggregation) timeframes.
 * Extracted as a separate module because ingest_market_data/index.js
 * exceeds the 2000-line safety limit for in-place edits.
 *
 * Yahoo interval limits (trading-day approximations):
 *   15m  → 60d  (interval string: '15m')
 *   30m  → 60d  (interval string: '30m')
 *   1h   → 730d (interval string: '60m')
 *   4h   → not native; aggregate from 1h (also 730d max)
 */

const path = require('node:path');

// ─── shared provider ───────────────────────────────────────────────────────
const { fetchYahooBaseCandles } = require('../../../../shared/lib/providers/yahoo');

// ─── constants ─────────────────────────────────────────────────────────────
const { YAHOO_MAX_DAYS } = require('./constants');

// ─── per-timeframe Yahoo interval strings ──────────────────────────────────
// Yahoo uses '60m' (not '1h') for the hourly interval.
const YAHOO_INTERVAL_STRINGS = {
  '15m': '15m',
  '30m': '30m',
  '1h':  '60m',  // Yahoo API quirk: hourly is '60m'
  '4h':  '60m',  // Fetched as 1h, aggregated client-side
};

// Max history Yahoo reliably serves per timeframe (trading days)
const INTRADAY_MAX_DAYS = {
  '15m': 60,
  '30m': 60,
  '1h':  730,
  '4h':  730,
};

// Supported intraday timeframes for intraday-accumulate
const SUPPORTED_INTRADAY_TFS = ['15m', '30m', '1h'];  // 4h not exposed in CLI; no native Yahoo support

/**
 * Aggregate raw 1h candles into 4h buckets.
 * Each bucket opens at floor(openTime / 4h) * 4h.
 *
 * @param {Array<{openTime:number,open:number,high:number,low:number,close:number,volume:number}>} candles
 * @returns {Array}
 */
function aggregate1hTo4h(candles) {
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
  const buckets = new Map();
  for (const c of candles) {
    const bucket = Math.floor(c.openTime / FOUR_HOURS_MS) * FOUR_HOURS_MS;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, { openTime: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low  = Math.min(existing.low,  c.low);
      existing.close = c.close;
      existing.volume += c.volume;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.openTime - b.openTime);
}

/**
 * Fetch native intraday bars from Yahoo Finance for a single symbol.
 *
 * @param {string} yahooSymbol  - Yahoo ticker (e.g. '^GSPC', 'GC=F', 'EURUSD=X')
 * @param {string} timeframe    - '15m', '30m', '1h', or '4h'
 * @param {number} days         - Number of calendar days to request (clamped to Yahoo max)
 * @returns {Promise<Array<{openTime:number,open:number,high:number,low:number,close:number,volume:number}>>}
 */
async function fetchYahooIntradayBars(yahooSymbol, timeframe, days) {
  if (!YAHOO_INTERVAL_STRINGS[timeframe]) {
    throw new Error(`fetchYahooIntradayBars: unsupported timeframe '${timeframe}'. Use one of: ${Object.keys(YAHOO_INTERVAL_STRINGS).join(', ')}`);
  }

  const maxDays = INTRADAY_MAX_DAYS[timeframe] ?? 60;
  const effectiveDays = Math.min(days, maxDays);

  if (effectiveDays < days) {
    console.log(`[INTRADAY-YAHOO] ${timeframe} capped at ${maxDays}d (requested ${days}d) — fetching ${effectiveDays}d for ${yahooSymbol}`);
  }

  const interval = YAHOO_INTERVAL_STRINGS[timeframe];
  const rawCandles = await fetchYahooBaseCandles(yahooSymbol, interval, effectiveDays);

  // 4h requires client-side aggregation from 1h data
  if (timeframe === '4h') {
    return aggregate1hTo4h(rawCandles);
  }

  return rawCandles;
}

/**
 * Convert raw base candles into the Sovereign record shape.
 *
 * @param {Array}  candles   - Raw candles from fetchYahooIntradayBars
 * @param {string} symbol    - Canonical symbol (e.g. 'SPX', 'EURUSD')
 * @param {string} timeframe - '15m', '30m', '1h', '4h'
 * @param {string} family    - 'indices' | 'commodities' | 'fx' | 'equities'
 * @returns {Array}
 */
function candlesToRecords(candles, symbol, timeframe, family) {
  return candles.map((c) => ({
    family,
    provider: 'yahoo',
    symbol,
    timeframe,
    timestamp: new Date(c.openTime).toISOString(),
    open:   c.open,
    high:   c.high,
    low:    c.low,
    close:  c.close,
    volume: c.volume,
  }));
}

module.exports = {
  fetchYahooIntradayBars,
  candlesToRecords,
  aggregate1hTo4h,
  SUPPORTED_INTRADAY_TFS,
  INTRADAY_MAX_DAYS,
  YAHOO_INTERVAL_STRINGS,
};
