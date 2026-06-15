'use strict';

// backfill-daemon: proves the cache-aware orchestration without touching the network.
// A cold cycle (no bins) must DEEP-fetch + roll up; a warm cycle (fresh bin) must
// SKIP, leaving the base bin's count untouched (no wasted poll).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeTsIndex, readTsIndex } = require('../../../shared/lib/market/validation.js');
const { rollupFromBase, rollupTargetsAboveBase } = require('../../../backend/cli/commands/data/data.js');
const {
  runBackfillCycle, decideAction, buildJobUniverse,
  groupIntoLanes, utcDayFloor, makeRealRollup,
} = require('../../../backend/cli/commands/data/backfill_daemon.js');

// Fake executor that writes a deterministic 1m bin (stands in for a network fetch).
function makeFakeFetcher(tsDir, calls) {
  return async (job, mode, days) => {
    calls.push({ symbol: job.symbol, mode, days });
    const base = Date.parse('2026-06-12T14:00:00.000Z');
    const sources = [];
    for (let i = 0; i < 30; i += 1) {
      const c = 100 + i;
      sources.push({
        symbol: job.symbol, family: job.family, provider: 'binance', timeframe: job.baseTf,
        timestamp: new Date(base + i * 60 * 1000).toISOString(),
        open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 1,
      });
    }
    writeTsIndex(tsDir, { sources });
    return { ok: true };
  };
}

test('decideAction maps gate reasons to deep/incremental/skip', () => {
  assert.equal(decideAction({ reason: 'missing', fresh: false }), 'deep');
  assert.equal(decideAction({ reason: 'empty', fresh: false }), 'deep');
  assert.equal(decideAction({ reason: 'fresh', fresh: true }), 'skip');
  assert.equal(decideAction({ reason: 'stale', fresh: false }), 'incremental');
  assert.equal(decideAction({ reason: 'no-threshold', fresh: false }), 'incremental');
});

test('cold cycle DEEP-fetches a missing symbol and rolls up coarser bins', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-'));
  const jobs = [{ symbol: 'BTCUSDT', family: 'crypto', baseTf: '1m' }];
  const calls = [];
  const fetch = makeFakeFetcher(tsDir, calls);
  const rollup = (job) => rollupFromBase(tsDir, job.symbol, job.baseTf, rollupTargetsAboveBase(job.baseTf));

  // No bin yet -> gate sees 'missing'.
  assert.equal(readTsIndex(tsDir, 'BTCUSDT', '1m'), null);

  const summary = await runBackfillCycle({ tsDir, jobs, now: Date.now(), execute: fetch, rollup, cycle: 1 });

  assert.equal(summary.deep, 1, 'one deep fetch');
  assert.equal(summary.skipped, 0);
  assert.equal(summary.rolled_up, 1, 'rolled up after fetch');
  assert.equal(summary.errors, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mode, 'deep');

  // Base bin written + coarser bins derived.
  const base1m = readTsIndex(tsDir, 'BTCUSDT', '1m');
  assert.equal(base1m.length, 30, '1m base written');
  const five = readTsIndex(tsDir, 'BTCUSDT', '5m');
  assert.equal(five.length, 6, '5m derived from 1m');
  assert.ok(readTsIndex(tsDir, 'BTCUSDT', '1h'), '1h bin present');

  console.log(JSON.stringify({ type: 'backfill_daemon_test', case: 'cold_cycle', deep: summary.deep, rolled_up: summary.rolled_up, bars_1m: base1m.length, bars_5m: five.length, fetch_calls: calls.length }));
});

test('warm cycle SKIPs a fresh symbol — no wasted fetch, base bin unchanged', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-'));
  const jobs = [{ symbol: 'BTCUSDT', family: 'crypto', baseTf: '1m' }];
  const calls = [];
  const fetch = makeFakeFetcher(tsDir, calls);
  const rollup = (job) => rollupFromBase(tsDir, job.symbol, job.baseTf, rollupTargetsAboveBase(job.baseTf));

  // Cold pass seeds the bin (last bar = 2026-06-12T14:29Z).
  await runBackfillCycle({ tsDir, jobs, now: Date.parse('2026-06-12T14:30:00Z'), execute: fetch, rollup, cycle: 1 });
  const seeded = readTsIndex(tsDir, 'BTCUSDT', '1m');
  assert.equal(seeded.length, 30);
  const callsAfterCold = calls.length;
  assert.equal(callsAfterCold, 1);

  // Warm pass 1 hour after the last bar (< crypto 1m freshness of 2h) -> SKIP.
  const warmNow = Date.parse('2026-06-12T15:29:00Z');
  const summary = await runBackfillCycle({ tsDir, jobs, now: warmNow, execute: fetch, rollup, cycle: 2 });

  assert.equal(summary.skipped, 1, 'fresh symbol skipped');
  assert.equal(summary.deep, 0);
  assert.equal(summary.incremental, 0);
  assert.equal(calls.length, callsAfterCold, 'no extra fetch issued on the warm cycle');

  const after = readTsIndex(tsDir, 'BTCUSDT', '1m');
  assert.equal(after.length, 30, '1m bin count unchanged');

  console.log(JSON.stringify({ type: 'backfill_daemon_test', case: 'warm_cycle', skipped: summary.skipped, fetch_calls_total: calls.length, bars_1m: after.length }));
});

test('OOM guard: --concurrency override is clamped on the 1m lanes, not on Yahoo', () => {
  // The 1m lanes (binance/alpaca) touch multi-million-row bins; a blanket high
  // concurrency exhausts the heap. The override must cap at the lane ceiling (3) for
  // those, while the Yahoo 5m lane (≈100× smaller bins) honors the full value.
  const jobs = [
    { symbol: 'BTCUSDT', family: 'crypto', baseTf: '1m' },
    { symbol: 'AAPL', family: 'equities', baseTf: '1m' },
    { symbol: 'SPX', family: 'indices', baseTf: '5m' },
  ];
  const lanes = groupIntoLanes(jobs, 5);
  const c = (lane) => lanes.find((l) => l.lane === lane).concurrency;
  assert.equal(c('binance'), 3, 'binance clamped to safe ceiling');
  assert.equal(c('alpaca'), 3, 'alpaca clamped to safe ceiling');
  assert.equal(c('yahoo'), 5, 'yahoo honors the full override');
  // A lower override is honored as-is (clamp only caps the upper bound).
  assert.equal(groupIntoLanes(jobs, 2).find((l) => l.lane === 'binance').concurrency, 2);
  console.log(JSON.stringify({ type: 'backfill_daemon_test', case: 'lane_clamp', binance: c('binance'), yahoo: c('yahoo') }));
});

test('utcDayFloor aligns a window start to a clean coarse-bar boundary', () => {
  const f = utcDayFloor(Date.parse('2026-06-15T13:47:22.500Z'));
  assert.equal(new Date(f).toISOString(), '2026-06-15T00:00:00.000Z');
  // Multiple of every intraday interval up to 4h -> no partial coarse bars.
  for (const ms of [300000, 900000, 1800000, 3600000, 14400000]) assert.equal(f % ms, 0);
});

test('incremental rollup re-derives the recent window byte-identically to a full rollup', () => {
  // Seed a continuous 1m base bin spanning ~12 days, then compare a full rollup against
  // a windowed (incremental) rollup over the last 8 days. Every coarse bar the windowed
  // pass emits must exactly match the full pass at the same timestamp (lossless).
  function seed(tsDir) {
    const start = utcDayFloor(Date.now() - 12 * 86400000);
    const sources = [];
    for (let i = 0; i < 12 * 1440; i += 1) {
      const c = 100 + (i % 50);
      sources.push({
        symbol: 'BTCUSDT', family: 'crypto', provider: 'binance', timeframe: '1m',
        timestamp: new Date(start + i * 60000).toISOString(),
        open: c, high: c + 1, low: c - 1, close: c + 0.5, volume: 2,
      });
    }
    writeTsIndex(tsDir, { sources });
  }
  const targets = rollupTargetsAboveBase('1m'); // 5m..4h
  const dFull = fs.mkdtempSync(path.join(os.tmpdir(), 'roll-full-'));
  const dWin = fs.mkdtempSync(path.join(os.tmpdir(), 'roll-win-'));
  seed(dFull); seed(dWin);

  const full = rollupFromBase(dFull, 'BTCUSDT', '1m', targets);
  const sinceMs = utcDayFloor(Date.now() - 8 * 86400000);
  const win = rollupFromBase(dWin, 'BTCUSDT', '1m', targets, { sinceMs });

  assert.ok(win.source_bars < full.source_bars, 'windowed read is a strict subset');
  let totalWin = 0;
  for (const tf of targets) {
    const fullArr = readTsIndex(dFull, 'BTCUSDT', tf);
    const fMap = new Map(fullArr.map((r) => [r.timestamp, r]));
    const w = readTsIndex(dWin, 'BTCUSDT', tf);
    totalWin += w.length;
    // (a) every windowed bar matches the full rollup's bar at the same timestamp
    for (const bar of w) {
      const f = fMap.get(bar.timestamp);
      assert.ok(f, `${tf} windowed bar ${bar.timestamp} exists in full rollup`);
      assert.deepEqual(
        [bar.open, bar.high, bar.low, bar.close, bar.volume],
        [f.open, f.high, f.low, f.close, f.volume],
        `${tf} bar at ${bar.timestamp} matches full rollup`,
      );
    }
    // (b) COMPLETENESS: the windowed pass must emit EVERY in-window bar (none dropped by
    // a too-small window) and ONLY in-window bars (count parity), so the merge can't leave
    // a stale coarse bar behind in the window.
    const winMs = new Set(w.map((r) => Date.parse(r.timestamp)));
    const fullInWindow = fullArr.filter((r) => Date.parse(r.timestamp) >= sinceMs);
    for (const f of fullInWindow) {
      assert.ok(winMs.has(Date.parse(f.timestamp)), `${tf} windowed pass dropped in-window bar ${f.timestamp}`);
    }
    assert.equal(w.length, fullInWindow.length, `${tf} windowed count == full in-window count (no partial/extra bars)`);
  }
  fs.rmSync(dFull, { recursive: true, force: true });
  fs.rmSync(dWin, { recursive: true, force: true });
  console.log(JSON.stringify({ type: 'backfill_daemon_test', case: 'windowed_rollup_lossless', full_bars: full.source_bars, window_bars: win.source_bars, derived_bars: totalWin }));
});

test('makeRealRollup passes a window for incremental jobs but reads the full bin for deep', () => {
  // A deep (first-fill) job must re-derive the whole freshly-written bin; an incremental
  // job must only re-derive the recent window. We assert via the source_bars each reads.
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roll-mode-'));
  const start = utcDayFloor(Date.now() - 12 * 86400000);
  const sources = [];
  for (let i = 0; i < 12 * 1440; i += 1) {
    sources.push({
      symbol: 'ETHUSDT', family: 'crypto', provider: 'binance', timeframe: '1m',
      timestamp: new Date(start + i * 60000).toISOString(),
      open: 1, high: 1, low: 1, close: 1, volume: 1,
    });
  }
  writeTsIndex(tsDir, { sources });
  const rollup = makeRealRollup(tsDir);
  const job = { symbol: 'ETHUSDT', family: 'crypto', baseTf: '1m' };
  const deep = rollup(job, 'deep');
  const incr = rollup(job, 'incremental');
  assert.equal(deep.source_bars, 12 * 1440, 'deep reads the whole bin');
  assert.ok(incr.source_bars < deep.source_bars, 'incremental reads only the tail');
  assert.ok(incr.source_bars <= 9 * 1440, 'incremental window is ~last 8 days + margin');
  fs.rmSync(tsDir, { recursive: true, force: true });
  console.log(JSON.stringify({ type: 'backfill_daemon_test', case: 'rollup_mode', deep_bars: deep.source_bars, incr_bars: incr.source_bars }));
});

test('buildJobUniverse assigns the right base grain per family', () => {
  const config = {
    crypto: { symbols: ['BTCUSDT', 'ETHUSDT'] },
    indices: { symbols: ['SPX'] },
  };
  const jobs = buildJobUniverse(config, ['crypto', 'indices']);
  const btc = jobs.find((j) => j.symbol === 'BTCUSDT');
  assert.equal(btc.baseTf, '1m', 'crypto base = 1m');
  const spx = jobs.find((j) => j.symbol === 'SPX');
  if (spx) assert.equal(spx.baseTf, '5m', 'indices base = 5m');
  console.log(JSON.stringify({ type: 'backfill_daemon_test', case: 'universe', jobs: jobs.length, crypto_base: btc.baseTf }));
});
