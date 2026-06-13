'use strict';

/**
 * intraday_yahoo.js — Yahoo native-poll intraday constants.
 *
 * FW3 plan/validation constants for the `intraday-accumulate` command. The actual
 * fetch + aggregation is handled by the shared ingest path
 * (`selectYahooBase` → `fetchYahooBaseCandles` → `aggregateCandles`), which already
 * supports 15m/30m/1h natively — so this module is intentionally constants-only.
 * (Yahoo accepts `interval=1h` directly; no `60m` translation is needed.)
 *
 * Yahoo interval depth limits (trading-day approximations):
 *   15m → 60d,  30m → 60d,  1h → 730d
 */

const { YAHOO_MAX_DAYS } = require('./constants');

// Timeframes exposed by `intraday-accumulate` (4h has no native Yahoo support).
const SUPPORTED_INTRADAY_TFS = ['15m', '30m', '1h'];

// Depth caps, sourced from the single canonical YAHOO_MAX_DAYS table so the two
// never drift. 4h is included for callers that aggregate it from 1h.
const INTRADAY_MAX_DAYS = {
  '15m': YAHOO_MAX_DAYS['15m'],
  '30m': YAHOO_MAX_DAYS['30m'],
  '1h':  YAHOO_MAX_DAYS['1h'],
  '4h':  YAHOO_MAX_DAYS['4h'],
};

module.exports = {
  SUPPORTED_INTRADAY_TFS,
  INTRADAY_MAX_DAYS,
};
