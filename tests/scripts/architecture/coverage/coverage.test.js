'use strict';

// coverage: cheap cache-availability probe over the binary ts-index. Proves exact
// bar count + last-bar timestamp (tail read, no full load) and the fresh/stale/
// missing gate decisions the backfill daemon relies on to avoid wasted polling.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeTsIndex } = require('../../../../shared/lib/market/validation.js');
const { readCoverage, isFresh, summarizeUniverse, isGrainSuspect } = require('../../../../shared/lib/market/coverage.js');

const Y = (s) => Date.parse(s);

test('isGrainSuspect flags coarse-data-leaked intraday bins, not honest-thin or deep-dense ones', () => {
  // LEAK: a 15m bin spanning 2002->2026 with ~1.5 bars/day (daily data mislabeled as 15m).
  const leak = isGrainSuspect('15m', 12728, Y('2002-08-01'), Y('2026-06-15'));
  assert.equal(leak.suspect, true);
  assert.ok(leak.barsPerDay < 5);

  // HONEST-THIN: a 4h bin over a RECENT ~440d window with ~1 bar/day (genuinely sparse source).
  assert.equal(isGrainSuspect('4h', 501, Y('2025-03-31'), Y('2026-06-15')).suspect, false);

  // DEEP-DENSE: real deep 5m (AAPL, 2007->2026, ~66 bars/day) must not be flagged.
  assert.equal(isGrainSuspect('5m', 456309, Y('2007-04-16'), Y('2026-06-12')).suspect, false);

  // NATIVE-DEEP 1h within ~2yr (Yahoo native) — recent-enough span, not flagged.
  assert.equal(isGrainSuspect('1h', 1714, Y('2025-01-20'), Y('2026-06-12')).suspect, false);

  // Non-intraday timeframe is never judged (no floor).
  assert.equal(isGrainSuspect('1d', 5, Y('2002-01-01'), Y('2026-01-01')).suspect, false);

  console.log(JSON.stringify({ type: 'coverage_test', case: 'grain_suspect', leak: leak.suspect, leakBpd: leak.barsPerDay }));
});

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
  assert.equal(cov.firstBarMs, lastMs - 49 * 60 * 1000, 'first-bar ms matches the oldest written bar (head read)');
  assert.equal(cov.ageMs, 5 * 60 * 1000, 'age = now - lastBar');

  console.log(JSON.stringify({ type: 'coverage_test', case: 'read_count_lastbar', count: cov.count, lastBarMs: cov.lastBarMs, firstBarMs: cov.firstBarMs, ageMs: cov.ageMs }));
});

test('readCoverage reports missing bins as exists:false (no crash)', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
  const cov = readCoverage(tsDir, 'NOPE', '1m', Date.now());
  assert.deepEqual(cov, { exists: false, count: 0, lastBarMs: null, firstBarMs: null, ageMs: null, notFoundCheckedMs: null });
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

test('readCoverage honors a meta-only not_found marker; isFresh skips it for 7d then re-probes', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
  const checkedMs = Date.parse('2026-06-14T00:00:00.000Z');
  // Delisted symbol: a 0-bar deep backfill wrote a meta-only marker (no .bin).
  fs.writeFileSync(
    path.join(tsDir, 'RNDRUSDT_1m.meta.json'),
    JSON.stringify({ symbol: 'RNDRUSDT', timeframe: '1m', family: 'crypto', provider: 'binance', count: 0, last_checked: checkedMs }),
    'utf8',
  );
  const cov = readCoverage(tsDir, 'RNDRUSDT', '1m', checkedMs);
  assert.equal(cov.exists, true, 'marker counts as a known (probed) symbol');
  assert.equal(cov.count, 0);
  assert.equal(cov.notFoundCheckedMs, checkedMs);

  // Within 7d -> fresh:true/reason:not_found so the daemon SKIPS (no infinite re-deep).
  const within = isFresh(tsDir, 'RNDRUSDT', '1m', 'crypto', checkedMs + 3 * 24 * 60 * 60 * 1000);
  assert.equal(within.fresh, true);
  assert.equal(within.reason, 'not_found');
  // After 7d -> marker expires, falls back to reason:empty so it gets re-probed.
  const after = isFresh(tsDir, 'RNDRUSDT', '1m', 'crypto', checkedMs + 8 * 24 * 60 * 60 * 1000);
  assert.equal(after.fresh, false);
  assert.equal(after.reason, 'empty');
  console.log(JSON.stringify({ type: 'coverage_test', case: 'not_found_marker', within: within.reason, after: after.reason }));
});

test('a real bin always wins over a not_found marker (clobber-guard invariant)', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
  const { lastMs } = writeBars(tsDir, 'BTCUSDT', 'crypto', '1m', 20, '2026-06-14T03:59:00.000Z');
  // Even if a stale 0-bar marker were written alongside, the .bin must win: readCoverage
  // reads the header count, never the marker, when the bin is present. (commandCryptoDeepBackfill
  // now refuses to write the marker at all when a bin exists — this proves the read side too.)
  fs.writeFileSync(
    path.join(tsDir, 'BTCUSDT_1m.meta.json'),
    JSON.stringify({ symbol: 'BTCUSDT', timeframe: '1m', family: 'crypto', provider: 'binance', count: 0, last_checked: Date.now() }),
    'utf8',
  );
  const cov = readCoverage(tsDir, 'BTCUSDT', '1m', lastMs + 60 * 1000);
  assert.equal(cov.count, 20, 'bin header count wins, marker count:0 ignored');
  assert.equal(cov.lastBarMs, lastMs);
  assert.equal(cov.notFoundCheckedMs, null, 'bin-present path does not surface the marker timestamp');
  console.log(JSON.stringify({ type: 'coverage_test', case: 'bin_wins_over_marker', count: cov.count }));
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
