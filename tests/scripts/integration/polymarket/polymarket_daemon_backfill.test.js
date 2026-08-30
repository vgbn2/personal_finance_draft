'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeTsIndex, readTsIndex } = require('../../../../shared/lib/market/validation.js');
const { rollupFromBase, rollupTargetsAboveBase } = require('../../../../backend/cli/commands/data/data.js');
const {
  runBackfillCycle,
  buildJobUniverse,
  groupIntoLanes,
  makeRealRollup,
  decideAction,
} = require('../../../../backend/cli/commands/data/backfill_daemon.js');

test('polymarket prediction market lane grouping and universe resolution', () => {
  const config = {
    prediction_market: {
      enabled: true,
      events: ['fed_rate_cut_prob', 'us_recession_2026'],
      timeframes: ['1h', '4h', '1d', '1w', '1mo'],
    },
    crypto: {
      enabled: true,
      symbols: ['BTCUSDT'],
      timeframes: ['1m', '5m', '1h', '1d'],
    },
  };

  const jobs = buildJobUniverse(config, ['prediction_market', 'crypto']);
  const pmJobs = jobs.filter((j) => j.family === 'prediction_market');
  assert.equal(pmJobs.length, 2, 'resolves 2 prediction market jobs');

  const fedJob = pmJobs.find((j) => j.symbol === 'FED_RATE_CUT_PROB');
  assert.ok(fedJob, 'FED_RATE_CUT_PROB is present');
  assert.equal(fedJob.baseTf, '1h', 'base timeframe is 1h');
  assert.deepEqual(fedJob.timeframes, ['1h', '4h', '1d', '1w', '1mo']);

  const lanes = groupIntoLanes(jobs);
  const pmLane = lanes.find((l) => l.lane === 'polymarket');
  assert.ok(pmLane, 'polymarket lane created');
  assert.equal(pmLane.concurrency, 2, 'concurrency is 2');
  assert.equal(pmLane.jobs.length, 2, '2 jobs assigned to polymarket lane');
});

test('polymarket cold cycle performs deep backfill and derives coarse rollups', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-daemon-cold-'));
  const symbol = 'FED_RATE_CUT_PROB';
  const jobs = [{
    symbol,
    family: 'prediction_market',
    baseTf: '1h',
    timeframes: ['1h', '4h', '1d', '1w', '1mo'],
  }];

  const calls = [];
  const fakeExecutor = async (job, mode, days) => {
    calls.push({ symbol: job.symbol, mode, days });
    // Write 48 hourly bars of probability prices (0.0 to 1.0)
    const base = Date.parse('2026-08-01T00:00:00.000Z');
    const sources = [];
    for (let i = 0; i < 48; i += 1) {
      const p = 0.65 + 0.05 * Math.sin(i / 5);
      sources.push({
        symbol: job.symbol,
        family: job.family,
        provider: 'polymarket',
        timeframe: '1h',
        timestamp: new Date(base + i * 3600 * 1000).toISOString(),
        open: p,
        high: p + 0.02,
        low: p - 0.02,
        close: p + 0.01,
        volume: 1000 + i * 10,
      });
    }
    writeTsIndex(tsDir, { sources });
    return { ok: true, records_written: sources.length };
  };

  const rollup = (job, mode) => {
    const targets = ['4h', '1d', '1w', '1mo'];
    return rollupFromBase(tsDir, job.symbol, job.baseTf, targets);
  };

  try {
    const summary = await runBackfillCycle({
      tsDir,
      jobs,
      now: Date.parse('2026-08-03T01:00:00.000Z'),
      execute: fakeExecutor,
      rollup,
      cycle: 1,
    });

    assert.equal(summary.deep, 1, 'executed 1 deep job');
    assert.equal(summary.skipped, 0);
    assert.equal(summary.errors, 0);
    assert.equal(summary.rolled_up, 1, 'derived coarser rollups');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].mode, 'deep');

    // Verify 1h base bin exists and has 48 bars
    const baseBars = readTsIndex(tsDir, symbol, '1h');
    assert.ok(baseBars, '1h base bin exists');
    assert.equal(baseBars.length, 48, 'contains 48 hourly bars');

    // Verify 4h derived bin
    const fourHourBars = readTsIndex(tsDir, symbol, '4h');
    assert.ok(fourHourBars, '4h derived bin exists');
    assert.equal(fourHourBars.length, 12, 'contains 12 4-hour bars');

    // Verify 1d derived bin
    const dailyBars = readTsIndex(tsDir, symbol, '1d');
    assert.ok(dailyBars, '1d derived bin exists');
    assert.equal(dailyBars.length, 2, 'contains 2 daily bars');
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});

test('polymarket warm cycle skips provider I/O when fresh within 6 hours', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-daemon-warm-'));
  const symbol = 'FED_RATE_CUT_PROB';
  const jobs = [{
    symbol,
    family: 'prediction_market',
    baseTf: '1h',
    timeframes: ['1h', '4h', '1d', '1w', '1mo'],
  }];

  const base = Date.parse('2026-08-30T00:00:00.000Z');
  const sources = [];
  for (let i = 0; i < 24; i += 1) {
    const p = 0.70;
    sources.push({
      symbol,
      family: 'prediction_market',
      provider: 'polymarket',
      timeframe: '1h',
      timestamp: new Date(base + i * 3600 * 1000).toISOString(),
      open: p,
      high: p,
      low: p,
      close: p,
      volume: 500,
    });
  }
  writeTsIndex(tsDir, { sources });

  const calls = [];
  const fakeExecutor = async (job, mode) => {
    calls.push({ symbol: job.symbol, mode });
    return { ok: true };
  };

  const rollup = (job) => rollupFromBase(tsDir, job.symbol, job.baseTf, ['4h', '1d']);

  try {
    // 2 hours after last bar (2026-08-30T23:00:00.000Z) -> within 6h freshness threshold -> SKIP
    const warmNow = Date.parse('2026-08-31T01:00:00.000Z');
    const summary = await runBackfillCycle({
      tsDir,
      jobs,
      now: warmNow,
      execute: fakeExecutor,
      rollup,
      cycle: 2,
    });

    assert.equal(summary.skipped, 1, 'fresh prediction market symbol skipped');
    assert.equal(summary.deep, 0);
    assert.equal(summary.incremental, 0);
    assert.equal(calls.length, 0, 'no network calls on warm cycle');
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});
