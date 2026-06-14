'use strict';

// coverage: cheap cache-availability probe over the binary ts-index. Proves exact
// bar count + last-bar timestamp (tail read, no full load) and the fresh/stale/
// missing gate decisions the backfill daemon relies on to avoid wasted polling.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeTsIndex } = require('../../../shared/lib/market/validation.js');
const { readCoverage, isFresh, summarizeUniverse } = require('../../../shared/lib/market/coverage.js');

// Write `n` crypto 1m bars ending exactly at `lastIso`, ascending.
function writeBars(tsDir, symbol, family, timeframe, n, lastIso) {
  const stepMs = 60 * 1000;
  const lastMs = Date.parse(lastIso);
  const sources = [];
  for (let i = 0; i < n; i += 1) {
    const ts = new Date(lastMs - (n - 1 - i) * stepMs).toISOString();
    const c = 100 + i;
    sources.push({ symbol, family, provider: 'binance', timeframe, timestamp: ts, open: c, high: c + 1, low: c - 1, close: c, volume: 7 });
  }
  writeTsIndex(tsDir, { sources });
  return { lastMs, count: n };
}

test('readCoverage returns exact count + last-bar ms from a known bin (tail read)', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
  const { lastMs } = writeBars(tsDir, 'BTCUSDT', 'crypto', '1m', 50, '2026-06-14T03:59:00.000Z');

  const now = lastMs + 5 * 60 * 1000; // 5 minutes after the last bar
  const cov = readCoverage(tsDir, 'BTCUSDT', '1m', now);
  assert.equal(cov.exists, true);
  assert.equal(cov.count, 50, 'all 50 bars counted');
  assert.equal(cov.lastBarMs, lastMs, 'last-bar ms matches the newest written bar');
  assert.equal(cov.ageMs, 5 * 60 * 1000, 'age = now - lastBar');

  console.log(JSON.stringify({ type: 'coverage_test', case: 'read_count_lastbar', count: cov.count, lastBarMs: cov.lastBarMs, ageMs: cov.ageMs }));
});

test('readCoverage reports missing bins as exists:false (no crash)', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
  const cov = readCoverage(tsDir, 'NOPE', '1m', Date.now());
  assert.deepEqual(cov, { exists: false, count: 0, lastBarMs: null, ageMs: null });
  console.log(JSON.stringify({ type: 'coverage_test', case: 'missing', exists: cov.exists }));
});

test('isFresh gates fresh-vs-stale-vs-missing for crypto 1m (threshold 2h)', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
  const { lastMs } = writeBars(tsDir, 'BTCUSDT', 'crypto', '1m', 30, '2026-06-14T03:59:00.000Z');

  // FRESH: 1h after last bar (< 2h crypto-1m threshold) -> skip.
  const freshNow = lastMs + 1 * 60 * 60 * 1000;
  const f1 = isFresh(tsDir, 'BTCUSDT', '1m', 'crypto', freshNow);
  assert.equal(f1.fresh, true);
  assert.equal(f1.reason, 'fresh');
  assert.equal(f1.thresholdMs, 2 * 60 * 60 * 1000);

  // STALE: 3h after last bar (> 2h threshold) -> poll incremental.
  const staleNow = lastMs + 3 * 60 * 60 * 1000;
  const f2 = isFresh(tsDir, 'BTCUSDT', '1m', 'crypto', staleNow);
  assert.equal(f2.fresh, false);
  assert.equal(f2.reason, 'stale');

  // MISSING: a symbol with no bin -> deep backfill.
  const f3 = isFresh(tsDir, 'ETHUSDT', '1m', 'crypto', staleNow);
  assert.equal(f3.fresh, false);
  assert.equal(f3.reason, 'missing');

  console.log(JSON.stringify({ type: 'coverage_test', case: 'fresh_gate', fresh: f1.reason, stale: f2.reason, missing: f3.reason, thresholdMs: f1.thresholdMs }));
});

test('summarizeUniverse returns one decision row per job', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
  const { lastMs } = writeBars(tsDir, 'BTCUSDT', 'crypto', '1m', 12, '2026-06-14T03:59:00.000Z');
  const now = lastMs + 30 * 60 * 1000; // fresh

  const rows = summarizeUniverse(tsDir, [
    { symbol: 'BTCUSDT', family: 'crypto', timeframe: '1m' },
    { symbol: 'ETHUSDT', family: 'crypto', timeframe: '1m' },
  ], now);

  assert.equal(rows.length, 2);
  const btc = rows.find((r) => r.symbol === 'BTCUSDT');
  const eth = rows.find((r) => r.symbol === 'ETHUSDT');
  assert.equal(btc.fresh, true);
  assert.equal(btc.count, 12);
  assert.equal(eth.reason, 'missing');
  assert.equal(eth.exists, false);

  console.log(JSON.stringify({ type: 'coverage_test', case: 'summarize', rows: rows.length, btc: btc.reason, eth: eth.reason }));
});
