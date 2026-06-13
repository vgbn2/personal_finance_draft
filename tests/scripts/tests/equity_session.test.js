'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { filterEquitySessionGaps, NYSE_OPEN_MINUTES, NYSE_CLOSE_MINUTES } = require(require('path').resolve(__dirname, '../../../shared/lib/market/equity_session'));

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
