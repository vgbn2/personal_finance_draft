'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { filterEquitySessionGaps, guardEquitySessionBars, NYSE_OPEN_MINUTES, NYSE_CLOSE_MINUTES } = require(require('path').resolve(__dirname, '../../../shared/lib/market/equity_session'));

function etBar(etHour, etMin, date) {
  date = date || '2026-06-13';
  var utcHour = etHour + 4;
  var hh = String(utcHour).padStart(2, '0');
  var mm = String(etMin).padStart(2, '0');
  return { timestamp: date + 'T' + hh + ':' + mm + ':00.000Z', open: 100, high: 101, low: 99, close: 100, volume: 1000 };
}

test('keeps bars within NYSE session hours', function() {
  var bars = [ etBar(9, 30), etBar(12, 0), etBar(15, 55) ];
  var result = filterEquitySessionGaps(bars);
  assert.equal(result.length, 3);
  console.log(JSON.stringify({ type: 'equity_session_test', case: 'in_session', kept: result.length }));
});

test('drops pre-market and post-market bars', function() {
  var bars = [ etBar(4, 0), etBar(9, 29), etBar(9, 30), etBar(16, 0), etBar(17, 0) ];
  var result = filterEquitySessionGaps(bars);
  assert.equal(result.length, 1);
  assert.equal(result[0].timestamp, bars[2].timestamp);
  console.log(JSON.stringify({ type: 'equity_session_test', case: 'pre_post_market', kept: result.length }));
});

test('drops intra-day gap over 10 min on same day', function() {
  var bars = [ etBar(9, 30), etBar(9, 35), etBar(10, 0), etBar(10, 5) ];
  var result = filterEquitySessionGaps(bars);
  assert.ok(result.length >= 2);
  assert.equal(result[0].timestamp, bars[0].timestamp);
  assert.equal(result[1].timestamp, bars[1].timestamp);
  console.log(JSON.stringify({ type: 'equity_session_test', case: 'intra_day_gap', kept: result.length }));
});

test('allows cross-session boundary', function() {
  var bars = [ etBar(15, 55, '2026-06-12'), etBar(9, 30, '2026-06-13') ];
  var result = filterEquitySessionGaps(bars);
  assert.equal(result.length, 2);
  console.log(JSON.stringify({ type: 'equity_session_test', case: 'cross_session', kept: result.length }));
});

test('handles empty and null input', function() {
  assert.deepEqual(filterEquitySessionGaps([]), []);
  assert.deepEqual(filterEquitySessionGaps(null), null);
  console.log(JSON.stringify({ type: 'equity_session_test', case: 'empty_null', ok: true }));
});

test('NYSE constants are correct', function() {
  assert.equal(NYSE_OPEN_MINUTES, 570);
  assert.equal(NYSE_CLOSE_MINUTES, 960);
});

test('guardEquitySessionBars only clips equity/index sub-daily bars; passes the rest through', function() {
  function rec(family, timeframe, bar) { return Object.assign({ family: family, timeframe: timeframe }, bar); }
  var records = [
    rec('equities', '5m', etBar(4, 0)),       // equity pre-market  -> DROP
    rec('equities', '5m', etBar(12, 0)),      // equity in-session  -> keep
    rec('indices', '15m', etBar(17, 0)),      // index post-market  -> DROP
    rec('indices', '15m', etBar(10, 0)),      // index in-session   -> keep
    rec('crypto', '5m', etBar(4, 0)),         // crypto 24/7        -> keep
    rec('fx', '1h', etBar(2, 0)),             // fx 24/5            -> keep
    rec('commodities', '30m', etBar(3, 0)),   // commodities ~24h   -> keep
    rec('equities', '1d', etBar(4, 0)),       // equity DAILY       -> keep (not sub-daily)
    { family: 'equities', timeframe: '5m', open: 1 }, // no timestamp -> keep
  ];
  var out = guardEquitySessionBars(records);
  assert.equal(out.dropped, 2);
  assert.equal(out.records.length, 7);
  // The two dropped records are exactly the out-of-session equity + index sub-daily bars.
  assert.ok(!out.records.some(function(r) { return r.family === 'equities' && r.timeframe === '5m' && r.timestamp === records[0].timestamp; }));
  assert.ok(!out.records.some(function(r) { return r.family === 'indices' && r.timeframe === '15m' && r.timestamp === records[2].timestamp; }));
  // Crypto/fx/commodities/daily/no-timestamp all survive.
  assert.ok(out.records.some(function(r) { return r.family === 'crypto'; }));
  assert.ok(out.records.some(function(r) { return r.family === 'fx'; }));
  assert.ok(out.records.some(function(r) { return r.family === 'commodities'; }));
  assert.ok(out.records.some(function(r) { return r.family === 'equities' && r.timeframe === '1d'; }));
  console.log(JSON.stringify({ type: 'equity_session_test', case: 'guard_mixed_family', kept: out.records.length, dropped: out.dropped }));
});
