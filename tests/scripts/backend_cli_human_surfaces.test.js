const assert = require('node:assert/strict');
const test = require('node:test');

const { buildMassBackfillExecutionPlan } = require('../../backend/cli/commands/data/data.js');
const { renderBackendUniverse } = require('../../backend/cli/commands/tools/backend.js');
const { inspectMt5Setup } = require('../../backend/cli/commands/trade/trade.js');

test('mass backfill plan skips fresh jobs without hiding stale ones', () => {
  const plan = buildMassBackfillExecutionPlan({
    symbols: ['AAPL', 'BTCUSDT'],
    timeframes: ['1d', '1h'],
    familyBySymbol: { AAPL: 'equities', BTCUSDT: 'crypto' },
    inspectJob(job) {
      if (job.symbol === 'AAPL' && job.timeframe === '1d') {
        return { skip: true, reason: 'fresh', age_hours: 2, records: 365 };
      }
      return { skip: false, reason: 'stale', age_hours: 120, records: 40 };
    },
  });

  assert.equal(plan.total_jobs, 4);
  assert.equal(plan.skipped.length, 1);
  assert.deepEqual(
    plan.jobs.map((job) => `${job.symbol}:${job.timeframe}`),
    ['AAPL:1h', 'BTCUSDT:1d', 'BTCUSDT:1h'],
  );
});

test('backend universe renderer stays human and points users to integrity for freshness', () => {
  const output = renderBackendUniverse({
    available: true,
    ok: true,
    input: 'storage/data/cache',
    entries: [
      { symbol: 'BTCUSDT', records: 22466, timeframes: ['1d', '1h', '15m'] },
      { symbol: 'ETHUSDT', records: 22344, timeframes: ['1d', '1h', '15m'] },
    ],
    quality: { rejected_records: 0 },
  });

  assert.match(output, /Backend Universe/);
  assert.match(output, /BTCUSDT/);
  assert.match(output, /Use `backend integrity` for freshness and readiness/);
});

test('mt5 diagnostics fail closed with actionable reasons', () => {
  const report = inspectMt5Setup('propfirm', null, '', true);
  assert.equal(report.ok, false);
  assert.match(report.next_action, /Fix:/);
  assert.equal(report.checks.find((check) => check.key === 'profile').ok, false);
  assert.equal(report.checks.find((check) => check.key === 'terminal').ok, false);
});
