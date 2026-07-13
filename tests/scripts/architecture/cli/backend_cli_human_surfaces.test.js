const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildMassBackfillExecutionPlan,
  classifyBackfillError,
  massBackfillUniverse,
  renderMassBackfillReport,
  summarizeMassBackfillByFamily,
} = require('../../../../backend/cli/commands/data/data.js');
const { renderBackendUniverse } = require('../../../../backend/cli/commands/tools/backend.js');
const { inspectMt5Setup } = require('../../../../backend/cli/commands/trade/trade.js');

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

test('mass backfill accepts the same supported price-family boundary as the technical scorecard', () => {
  const config = {
    equities: { symbols: ['AAPL'] },
    crypto: { symbols: ['BTCUSDT'] },
    macro: { symbols: ['CPI'] },
  };
  const { symbols, familyBySymbol } = massBackfillUniverse(config, ['crypto']);
  assert.deepEqual(symbols, ['BTCUSDT']);
  assert.deepEqual(familyBySymbol, { BTCUSDT: 'crypto' });
});

test('mass backfill report mirrors backend integrity section format', () => {
  const jobResults = [
    { ok: true, family: 'equities', symbol: 'AAPL', timeframe: '1h', records: 2550, provider_errors: 0 },
    { ok: false, family: 'equities', symbol: 'CMG', timeframe: '15m', records: 0, provider_errors: 0, code: 'filesystem_rename_eperm', message: 'EPERM: operation not permitted, rename tmp -> bin' },
    { ok: true, family: 'crypto', symbol: 'BTCUSDT', timeframe: '1d', records: 3650, provider_errors: 2 },
  ];
  const failures = jobResults.filter((result) => !result.ok);
  const output = renderMassBackfillReport({
    ok: false,
    fetched_at: '2026-06-13T06:00:00.000Z',
    jobs: 3,
    successful: 2,
    errors: 1,
    failure_count: failures.length,
    failure_codes: failures.map((failure) => failure.code),
    failures,
    records: 6200,
    skipped_jobs: 216,
    skipped_preview: [{ family: 'equities', symbol: 'MSFT', timeframe: '1h', reason: 'fresh' }],
    families: summarizeMassBackfillByFamily(jobResults),
    symbols: 2,
    timeframes: ['1h', '15m', '1d'],
    days: '365',
    concurrency: 10,
    output: 'storage/data/cache',
  });

  assert.match(output, /\[MASS BACKFILL REPORT\]/);
  assert.match(output, /Coverage: 2\/3 jobs OK \| failed: 1 \| skipped: 216 \| records: 6200/);
  assert.match(output, /EQUITIES\s+WARN\s+1\/2 jobs/);
  assert.match(output, /CMG:15m\s+filesystem_rename_eperm/);
  assert.match(output, /Next step: serialize backfills or add a ts-index\/cache write lock/);
});

test('mass backfill error classifier recognizes Windows rename EPERM', () => {
  assert.equal(
    classifyBackfillError("EPERM: operation not permitted, rename 'x.tmp' -> 'x.bin'"),
    'filesystem_rename_eperm',
  );
  assert.equal(classifyBackfillError('fetch failed: ENOTFOUND query1.finance.yahoo.com'), 'provider_transport');
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
