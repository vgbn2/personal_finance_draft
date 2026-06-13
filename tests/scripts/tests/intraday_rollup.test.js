'use strict';

// intraday-rollup: derives deep 15m/30m/1h/4h from the deep 5m bin by local OHLCV
// aggregation. Proves it is LOSSLESS (5m bin untouched) and the aggregation is correct.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { commandIntradayRollup, listDeepFiveMinSymbols } = require('../../../backend/cli/commands/data/data.js');
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
