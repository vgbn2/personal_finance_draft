'use strict';
/**
 * equity_session.js -- NYSE session-gap guard for intraday bars.
 *
 * Filters out bars outside NYSE regular session hours (09:30-16:00 ET).
 * This prevents pre/post-market and overnight gap bars from corrupting
 * indicator calculations and backtest return series.
 *
 * The guard does NOT drop intra-session bars based on timestamp spacing.
 * Normal session bars are spaced up to 6.5h apart (09:30 to 16:00) and
 * that is expected. Filtering by session hour is sufficient.
 */

var NYSE_OPEN_MINUTES = 9 * 60 + 30;
var NYSE_CLOSE_MINUTES = 16 * 60;

function etMinuteOfDay(isoTimestamp) {
  var d = new Date(isoTimestamp);
  var etStr = d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  var parts = etStr.split(':');
  var h = Number(parts[0]);
  var m = Number(parts[1]);
  return h * 60 + m;
}

/**
 * filterEquitySessionGaps(bars) -- NYSE session hour filter.
 *
 * Drops bars whose timestamps fall outside NYSE regular session hours
 * (before 09:30 ET or at/after 16:00 ET). Keeps all bars inside the
 * session window regardless of spacing.
 *
 * @param {Array<{timestamp: string, ...}>} bars -- any order
 * @returns {Array} filtered bars (same objects, no copy)
 */
function filterEquitySessionGaps(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return bars;

  var kept = [];
  for (var i = 0; i < bars.length; i++) {
    var bar = bars[i];
    if (!bar || !bar.timestamp) continue;
    var ms = Date.parse(bar.timestamp);
    if (!Number.isFinite(ms)) continue;
    var minute;
    try { minute = etMinuteOfDay(bar.timestamp); } catch (_) { continue; }
    if (minute < NYSE_OPEN_MINUTES || minute >= NYSE_CLOSE_MINUTES) continue;
    kept.push(bar);
  }
  return kept;
}

// Families whose cash instruments only print during the NYSE regular session.
// Commodities/fx trade ~24h and crypto 24/7, so they must NOT be session-clipped.
var SESSION_GUARDED_FAMILIES = { equities: true, indices: true };

// Timeframes fine enough that a session-hour filter is meaningful. Daily-and-above
// (1d/1w/1mo) carry one bar per session and are passed through untouched.
var SUB_DAILY_TFS = { '1m': true, '5m': true, '15m': true, '30m': true, '1h': true, '4h': true };

/**
 * guardEquitySessionBars(records) -- record-aware, family-gated session guard.
 *
 * Wraps the NYSE-hours filter so it can run at a raw-bar loader boundary that
 * carries mixed families/timeframes. Only equity/index sub-daily bars are
 * session-clipped (09:30-16:00 ET); every other record passes through unchanged.
 * Records missing a timestamp are KEPT (never silently dropped).
 *
 * @param {Array<{family?:string, timeframe?:string, timestamp?:string}>} records
 * @returns {{ records: Array, dropped: number }}
 */
function guardEquitySessionBars(records) {
  if (!Array.isArray(records) || records.length === 0) return { records: records, dropped: 0 };

  var kept = [];
  var dropped = 0;
  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    if (!rec) continue;
    var fam = String(rec.family || '').toLowerCase();
    var guarded = SESSION_GUARDED_FAMILIES[fam] && SUB_DAILY_TFS[rec.timeframe];
    if (!guarded || !rec.timestamp) { kept.push(rec); continue; }
    var minute;
    try { minute = etMinuteOfDay(rec.timestamp); } catch (_) { kept.push(rec); continue; }
    if (minute < NYSE_OPEN_MINUTES || minute >= NYSE_CLOSE_MINUTES) { dropped++; continue; }
    kept.push(rec);
  }
  return { records: kept, dropped: dropped };
}

module.exports = {
  NYSE_OPEN_MINUTES: NYSE_OPEN_MINUTES,
  NYSE_CLOSE_MINUTES: NYSE_CLOSE_MINUTES,
  SESSION_GUARDED_FAMILIES: SESSION_GUARDED_FAMILIES,
  SUB_DAILY_TFS: SUB_DAILY_TFS,
  filterEquitySessionGaps: filterEquitySessionGaps,
  guardEquitySessionBars: guardEquitySessionBars,
};