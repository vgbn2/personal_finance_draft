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
const { runBackfillCycle, decideAction, buildJobUniverse } = require('../../../backend/cli/commands/data/backfill_daemon.js');

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
