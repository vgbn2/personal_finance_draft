'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { filterEquitySessionGaps, guardEquitySessionBars, NYSE_OPEN_MINUTES, NYSE_CLOSE_MINUTES } = require(require('path').resolve(__dirname, '../../../../shared/lib/market/equity_session'));

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

test('keeps in-session bars regardless of intra-session spacing (does NOT drop by gap)', function() {
  // Invariant (per equity_session docstring): the guard filters by SESSION HOUR
  // only; it must NOT drop intra-session bars for being far apart. A 25-min gap
  // (09:35 -> 10:00) inside the session is expected and must survive.
  var bars = [ etBar(9, 30), etBar(9, 35), etBar(10, 0), etBar(12, 30) ];
  var result = filterEquitySessionGaps(bars);
  assert.equal(result.length, 4, 'all 4 in-session bars kept despite gaps');
  assert.deepEqual(
    result.map(function(b) { return b.timestamp; }),
    bars.map(function(b) { return b.timestamp; }),
    'order and identity preserved, nothing dropped'
  );
  console.log(JSON.stringify({ type: 'equity_session_test', case: 'spacing_not_a_drop_reason', input: bars.length, kept: result.length, dropped: bars.length - result.length }));
});

test('clips on EST (UTC-5) in winter, not a fixed summer offset (DST correctness)', function() {
  // The guard converts via America/New_York precisely so it tracks DST. The rest of
  // this suite builds bars with a hardcoded +4 (EDT) offset; here we use raw UTC for a
  // WINTER date (2026-01-13, EST = UTC-5) and prove the boundary moves with the zone.
  //   13:30Z = 08:30 ET pre-market  -> DROP  (a naive +4 offset would read 09:30 and wrongly KEEP)
  //   14:30Z = 09:30 ET open        -> keep
  //   20:55Z = 15:55 ET             -> keep
  //   21:00Z = 16:00 ET close       -> DROP
  var bars = [
    { timestamp: '2026-01-13T13:30:00.000Z', open: 1, high: 1, low: 1, close: 1, volume: 1 },
    { timestamp: '2026-01-13T14:30:00.000Z', open: 2, high: 2, low: 2, close: 2, volume: 1 },
    { timestamp: '2026-01-13T20:55:00.000Z', open: 3, high: 3, low: 3, close: 3, volume: 1 },
    { timestamp: '2026-01-13T21:00:00.000Z', open: 4, high: 4, low: 4, close: 4, volume: 1 },
  ];
  var result = filterEquitySessionGaps(bars);
  assert.equal(result.length, 2, 'only the two EST in-session bars survive');
  assert.deepEqual(result.map(function(b) { return b.timestamp; }), [bars[1].timestamp, bars[2].timestamp]);
  console.log(JSON.stringify({ type: 'equity_session_test', case: 'dst_winter_est', input: bars.length, kept: result.length, kept_ts: result.map(function(b) { return b.timestamp; }) }));
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
