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

module.exports = {
  NYSE_OPEN_MINUTES: NYSE_OPEN_MINUTES,
  NYSE_CLOSE_MINUTES: NYSE_CLOSE_MINUTES,
  filterEquitySessionGaps: filterEquitySessionGaps,
};