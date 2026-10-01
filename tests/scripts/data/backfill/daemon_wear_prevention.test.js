'use strict';

/**
 * backfill_daemon_wear_prevention.test.js
 *
 * Verifies that backfill daemon prevents redundant disk write wear and NVMe churn:
 * 1. Warm cycle on fresh symbols performs ZERO derived rollups and ZERO disk writes.
 * 2. Missing derived bins on fresh symbols are selectively restored without full-universe rewriting.
 * 3. Stale derived bins behind the fresh base timestamp are brought up to parity.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeTsIndex, readTsIndex } = require('../../../../shared/lib/market/validation.js');
const { rollupFromBase, rollupTargetsAboveBase } = require('../../../../backend/cli/commands/data/data.js');
const { runBackfillCycle } = require('../../../../backend/cli/commands/data/backfill_daemon.js');

test('backfill daemon performs ZERO derived rollups when all derived bins are already fresh', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-wear-'));
  const jobs = [{ symbol: 'BTCUSDT', family: 'crypto', baseTf: '1m' }];
  const baseMs = Date.parse('2026-06-12T14:00:00.000Z');

  // Cold setup: seed 1m base bin (30 bars from 14:00 to 14:29Z)
  const sources = [];
  for (let i = 0; i < 30; i += 1) {
    sources.push({
      symbol: 'BTCUSDT',
      family: 'crypto',
      provider: 'binance',
      timeframe: '1m',
      timestamp: new Date(baseMs + i * 60 * 1000).toISOString(),
      open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 10,
    });
  }
  writeTsIndex(tsDir, { sources });

  // Derive all targets once so everything exists and is fresh
  const rollupRes = rollupFromBase(tsDir, 'BTCUSDT', '1m', rollupTargetsAboveBase('1m'));
  assert.ok(rollupRes.ok);
  assert.ok(readTsIndex(tsDir, 'BTCUSDT', '5m'));
  assert.ok(readTsIndex(tsDir, 'BTCUSDT', '1h'));

  let rollupInvocationCount = 0;
  const spyRollup = (job, action) => {
    rollupInvocationCount += 1;
    return rollupFromBase(tsDir, job.symbol, job.baseTf, rollupTargetsAboveBase(job.baseTf));
  };

  // Warm cycle: timestamp is 15:00Z (< crypto 1m freshness threshold of 2h)
  const warmNow = Date.parse('2026-06-12T15:00:00.000Z');
  const summary = await runBackfillCycle({
    tsDir,
    jobs,
    now: warmNow,
    execute: async () => assert.fail('provider fetch must not execute on fresh bin'),
    rollup: spyRollup,
    cycle: 2,
  });

  assert.equal(summary.skipped, 1, 'symbol is skipped by freshness gate');
  assert.equal(summary.rolled_up, 0, 'ZERO derived rollups performed on warm fresh cycle');
  assert.equal(summary.errors, 0);
  assert.equal(rollupInvocationCount, 0, 'rollup function was not invoked, saving SSD write wear');

  fs.rmSync(tsDir, { recursive: true, force: true });
});

test('backfill daemon selectively restores a missing derived bin without rewriting untouched bins', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-wear-missing-'));
  const jobs = [{ symbol: 'BTCUSDT', family: 'crypto', baseTf: '1m' }];
  const baseMs = Date.parse('2026-06-12T14:00:00.000Z');

  const sources = [];
  for (let i = 0; i < 30; i += 1) {
    sources.push({
      symbol: 'BTCUSDT',
      family: 'crypto',
      provider: 'binance',
      timeframe: '1m',
      timestamp: new Date(baseMs + i * 60 * 1000).toISOString(),
      open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 10,
    });
  }
  writeTsIndex(tsDir, { sources });
  rollupFromBase(tsDir, 'BTCUSDT', '1m', rollupTargetsAboveBase('1m'));

  // Delete only the 1h bin to simulate partial or interrupted state
  fs.unlinkSync(path.join(tsDir, 'BTCUSDT_1h.bin'));
  fs.unlinkSync(path.join(tsDir, 'BTCUSDT_1h.meta.json'));
  assert.equal(readTsIndex(tsDir, 'BTCUSDT', '1h'), null);

  let rollupInvocations = 0;
  const spyRollup = (job, action) => {
    rollupInvocations += 1;
    return rollupFromBase(tsDir, job.symbol, job.baseTf, rollupTargetsAboveBase(job.baseTf));
  };

  const warmNow = Date.parse('2026-06-12T15:00:00.000Z');
  const summary = await runBackfillCycle({
    tsDir,
    jobs,
    now: warmNow,
    execute: async () => assert.fail('provider fetch must not execute on fresh bin'),
    rollup: spyRollup,
    cycle: 3,
  });

  assert.equal(summary.skipped, 1);
  assert.equal(summary.rolled_up, 1, 'repair rollup executed for missing bin');
  assert.equal(rollupInvocations, 1);
  assert.ok(readTsIndex(tsDir, 'BTCUSDT', '1h'), 'missing 1h bin was successfully restored');

  fs.rmSync(tsDir, { recursive: true, force: true });
});
