const assert = require('node:assert/strict');
const test = require('node:test');

const { buildMassBackfillExecutionPlan, massBackfillUniverse } = require('../../backend/cli/commands/data/data.js');
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

test('massBackfillUniverse covers universe_matrix grid symbols, not just the flat list', () => {
  const config = {
    equities: {
      symbols: ['AAPL', 'SPY'],
      universe_matrix: {
        grid: {
          USA: { financials: ['JPM', 'GS'], technology: ['AAPL'] },
          VN: { financials: ['VCB'] },
        },
      },
    },
    crypto: { symbols: ['BTCUSDT'] },
    indices: { symbols: ['SPX'] },
  };

  const { symbols, familyBySymbol } = massBackfillUniverse(config, ['equities', 'crypto', 'indices']);

  // Grid-only symbols (JPM/GS/VCB) must be included alongside the flat list.
  for (const s of ['AAPL', 'SPY', 'JPM', 'GS', 'VCB', 'BTCUSDT', 'SPX']) {
    assert.ok(symbols.includes(s), `${s} should be in the mass-backfill universe`);
  }
  // Deduped (AAPL is in both flat and grid).
  assert.equal(symbols.filter((s) => s === 'AAPL').length, 1);
  assert.equal(familyBySymbol.JPM, 'equities');
  assert.equal(familyBySymbol.BTCUSDT, 'crypto');
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
