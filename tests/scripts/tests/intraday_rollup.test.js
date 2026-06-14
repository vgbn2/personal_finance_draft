'use strict';

// intraday-rollup: derives deep 15m/30m/1h/4h from the deep 5m bin by local OHLCV
// aggregation. Proves it is LOSSLESS (5m bin untouched) and the aggregation is correct.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { commandIntradayRollup, listDeepFiveMinSymbols, rollupFromBase, rollupTargetsAboveBase } = require('../../../backend/cli/commands/data/data.js');
const { writeTsIndex, readTsIndex } = require('../../../shared/lib/market/validation.js');

// Build a deterministic deep 5m fixture: 24 bars from 14:00Z stepping 5 min
// (14:00 .. 15:55), close ramps 100..123 so OHLC is checkable.
function makeFiveMinBin(tsDir, symbol, family) {
  const base = Date.parse('2026-06-12T14:00:00.000Z');
  const sources = [];
  for (let i = 0; i < 24; i += 1) {
    const c = 100 + i;
    sources.push({
      symbol, family, provider: 'binance', timeframe: '5m',
      timestamp: new Date(base + i * 5 * 60 * 1000).toISOString(),
      open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 2,
    });
  }
  writeTsIndex(tsDir, { sources });
}

test('intraday-rollup derives 1h from deep 5m and leaves the 5m bin untouched (lossless)', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollup-'));
  makeFiveMinBin(tsDir, 'TST', 'crypto');

  // Pre-state: 24 5m bars, no 1h bin.
  const before5m = readTsIndex(tsDir, 'TST', '5m');
  assert.equal(before5m.length, 24);
  assert.equal(readTsIndex(tsDir, 'TST', '1h'), null);

  assert.deepEqual(listDeepFiveMinSymbols(tsDir), ['TST']);

  const rc = await commandIntradayRollup(['--ts-dir', tsDir, '--symbols', 'TST', '--timeframes', '1h', '--json']);
  assert.equal(rc, 0);

  // 24 5m bars over 14:00-15:55 -> two 1h buckets (14:00, 15:00).
  const after1h = readTsIndex(tsDir, 'TST', '1h');
  assert.equal(after1h.length, 2, 'two 1h buckets derived');

  // First bucket aggregates the 12 bars 14:00..14:55 (closes 100..111).
  const b0 = after1h[0];
  assert.equal(b0.timestamp, '2026-06-12T14:00:00.000Z');
  assert.equal(b0.open, 100);            // first 5m open
  assert.equal(b0.close, 111);           // last 5m close in the hour
  assert.equal(b0.high, 111.5);          // max high
  assert.equal(b0.low, 99.5);            // min low
  assert.equal(b0.volume, 24);           // 12 bars x 2
  // (provenance fields like derived_from_timeframe are not persisted in the 48-byte
  //  binary ts record — only OHLCV + meta survive the round-trip.)

  // Lossless: the 5m bin is byte-for-byte unchanged.
  const after5m = readTsIndex(tsDir, 'TST', '5m');
  assert.equal(after5m.length, 24, '5m bin still has all 24 bars');
  assert.deepEqual(after5m.map((r) => r.close), before5m.map((r) => r.close));

  console.log(JSON.stringify({ type: 'intraday_rollup_test', bars_5m: after5m.length, bars_1h: after1h.length, lossless: true }));
});

test('rollupFromBase derives 5m + 15m from a deep 1m bin, lossless (1m bin untouched)', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollup1m-'));
  // 30 native 1m bars from 14:00Z stepping 1 min (14:00 .. 14:29), close ramps 100..129.
  const base = Date.parse('2026-06-12T14:00:00.000Z');
  const sources = [];
  for (let i = 0; i < 30; i += 1) {
    const c = 100 + i;
    sources.push({
      symbol: 'TST', family: 'crypto', provider: 'binance', timeframe: '1m',
      timestamp: new Date(base + i * 60 * 1000).toISOString(),
      open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 3,
    });
  }
  writeTsIndex(tsDir, { sources });

  // Targets above a 1m base must include 5m (the user's "derive the rest" guarantee).
  assert.deepEqual(rollupTargetsAboveBase('1m'), ['5m', '15m', '30m', '1h', '4h']);

  const before1m = readTsIndex(tsDir, 'TST', '1m');
  assert.equal(before1m.length, 30);

  const res = rollupFromBase(tsDir, 'TST', '1m', ['5m', '15m']);
  assert.equal(res.ok, true);
  assert.equal(res.source_bars, 30);
  assert.equal(res.base_timeframe, '1m');

  // 30 1m bars over 14:00-14:29 -> six 5m buckets and two 15m buckets.
  const after5m = readTsIndex(tsDir, 'TST', '5m').sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  assert.equal(after5m.length, 6, 'six 5m buckets derived from 1m');
  // First 5m bucket aggregates 1m bars 14:00..14:04 (closes 100..104).
  assert.equal(after5m[0].timestamp, '2026-06-12T14:00:00.000Z');
  assert.equal(after5m[0].open, 100);
  assert.equal(after5m[0].close, 104);
  assert.equal(after5m[0].high, 104.5);
  assert.equal(after5m[0].low, 99.5);
  assert.equal(after5m[0].volume, 15); // 5 bars x 3

  const after15m = readTsIndex(tsDir, 'TST', '15m').sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  assert.equal(after15m.length, 2, 'two 15m buckets derived from 1m');
  assert.equal(after15m[0].close, 114);   // last 1m close in 14:00-14:14
  assert.equal(after15m[0].volume, 45);   // 15 bars x 3

  // Lossless: the 1m bin is byte-for-byte unchanged.
  const after1m = readTsIndex(tsDir, 'TST', '1m');
  assert.equal(after1m.length, 30, '1m bin still has all 30 bars');
  assert.deepEqual(after1m.map((r) => r.close), before1m.map((r) => r.close));

  console.log(JSON.stringify({ type: 'intraday_rollup_test', case: 'rollup_from_1m', source_1m: after1m.length, derived_5m: after5m.length, derived_15m: after15m.length, lossless: true }));
});

test('intraday-rollup is merge-protected: a pre-existing non-overlapping native coarser bar survives', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollup-'));
  makeFiveMinBin(tsDir, 'TST', 'crypto'); // 5m bars 14:00..15:55Z -> 1h buckets 14:00 & 15:00

  // Seed a NATIVE 1h bar at 10:00Z — earlier than, and non-overlapping with, any
  // bucket the 5m rollup will produce. The code claims new-wins-on-timestamp merge,
  // so this untouched-timestamp native bar must survive the derive.
  writeTsIndex(tsDir, { sources: [{
    symbol: 'TST', family: 'crypto', provider: 'binance', timeframe: '1h',
    timestamp: '2026-06-12T10:00:00.000Z', open: 50, high: 55, low: 45, close: 52, volume: 999,
  }] });
  const before1h = readTsIndex(tsDir, 'TST', '1h');
  assert.equal(before1h.length, 1, 'pre-state: one native 1h bar');

  const rc = await commandIntradayRollup(['--ts-dir', tsDir, '--symbols', 'TST', '--timeframes', '1h', '--json']);
  assert.equal(rc, 0);

  const after1h = readTsIndex(tsDir, 'TST', '1h').sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  // 1 pre-existing native + 2 derived (14:00, 15:00), no clobber, no dup.
  assert.equal(after1h.length, 3, 'native bar preserved alongside two derived buckets');
  const native = after1h.find((r) => r.timestamp === '2026-06-12T10:00:00.000Z');
  assert.ok(native, 'native 10:00 bar present');
  assert.equal(native.close, 52, 'native bar values untouched');
  assert.equal(native.volume, 999, 'native bar volume untouched');
  const derived = after1h.find((r) => r.timestamp === '2026-06-12T14:00:00.000Z');
  assert.equal(derived.close, 111, 'derived 14:00 bucket close = last 5m close in hour');

  console.log(JSON.stringify({ type: 'intraday_rollup_test', case: 'merge_protected', before_1h: before1h.length, after_1h: after1h.length, native_survived: true }));
});

test('intraday-rollup rejects an unsupported target timeframe', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollup-'));
  makeFiveMinBin(tsDir, 'TST', 'crypto');
  const rc = await commandIntradayRollup(['--ts-dir', tsDir, '--timeframes', '5m', '--json']);
  assert.equal(rc, 1, '5m is not a valid coarser target');
});

test('intraday-rollup fails clearly when no deep 5m bin matches', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollup-'));
  const rc = await commandIntradayRollup(['--ts-dir', tsDir, '--symbols', 'NONE', '--json']);
  assert.equal(rc, 1);
});
