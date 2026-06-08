const assert = require('node:assert/strict');
const test = require('node:test');

const manifest = require('../../backend/cli/tui/manifest');
const { backtestDataQualityError, rejectDegradedResearchInput, backtestSummaryPayload } = require('../../backend/cli/commands/research');
const { ingestOptionsFromArgs } = require('../../backend/cli/commands/data/data');
const { polymarketHistoryPayload } = require('../../backend/cli/commands/trade/trade');

test('optimize does not expose prop-firm selection', () => {
  const optimize = manifest.commands.research.find((entry) => entry.id === 'optimize');
  assert.ok(optimize);
  assert.ok(optimize.flags);
  assert.match(optimize.label, /^Optimize \(Indicators only\)$/);
  assert.equal(Object.prototype.hasOwnProperty.call(optimize.flags, '--prop-firm'), false);
});

test('backtest no longer exposes prop-firm selection', () => {
  const backtest = manifest.commands.research.find((entry) => entry.id === 'bt');
  assert.ok(backtest);
  assert.ok(backtest.flags);
  assert.match(backtest.label, /^Backtest \(Prop-firm fit\)$/);
  assert.equal(Object.prototype.hasOwnProperty.call(backtest.flags, '--prop-firm'), false);
});

test('prop-firm menu is exposed as its own category', () => {
  const propFirmCategory = manifest.commands.propfirm;
  assert.ok(Array.isArray(propFirmCategory));

  const setActive = propFirmCategory.find((entry) => entry.id === 'set-active');
  const list = propFirmCategory.find((entry) => entry.id === 'prop-firms');

  assert.ok(list);
  assert.match(list.label, /^Prop Firm Profiles$/);
  assert.ok(setActive);
  assert.ok(setActive.flags);
  assert.match(setActive.label, /^Set Active Prop Firm$/);
  assert.match(setActive.flags.profile.label, /^Prop-firm profile$/);
});

test('strategy menu exposes registry sync without prop-firm actions', () => {
  const sync = manifest.commands.strategy.find((entry) => entry.id === 'sync');

  assert.ok(sync);
  assert.match(sync.label, /^Sync Strategy Registry$/);
  assert.equal(manifest.commands.strategy.some((entry) => entry.id === 'set-active'), false);
  assert.equal(manifest.commands.strategy.some((entry) => entry.id === 'prop-firms'), false);
});

test('ingest TUI family selector maps to scoped ingest options', () => {
  const ingest = manifest.commands.op.find((entry) => entry.id === 'ingest');

  assert.ok(ingest);
  assert.ok(ingest.flags);
  assert.ok(ingest.flags['--family']);
  assert.ok(ingest.flags['--history-days']);
  assert.equal(ingestOptionsFromArgs(['--family', 'commodities']).family, 'commodities');
  assert.deepEqual(
    ingestOptionsFromArgs(['--family', 'prediction_market', '--symbol', 'fed_rate_cut_prob', '--timeframe', '1h', '--history-days', '30']),
    {
      family: 'prediction_market',
      symbol: 'fed_rate_cut_prob',
      timeframe: '1h',
      historyDays: 30,
    }
  );
  assert.deepEqual(ingestOptionsFromArgs(['--family', 'all']), {});
});

test('polymarket TUI exposes historical price ingestion path', () => {
  const history = manifest.commands.polymarket.find((entry) => entry.id === 'history');

  assert.ok(history);
  assert.deepEqual(history.prefix, ['polymarket']);
  assert.ok(history.loading);
  assert.ok(history.flags['--event']);
  assert.ok(history.flags['--history-days']);
  assert.ok(history.flags['--timeframe']);
});

test('polymarket history output is scoped to prediction-market records and errors', () => {
  const payload = polymarketHistoryPayload({
    mode: 'live',
    fetched_at: '2026-06-04T00:00:00.000Z',
    sources: [
      { family: 'macro', provider: 'fred', symbol: 'US02YIELD', timestamp: '2026-06-04T00:00:00.000Z' },
      { family: 'prediction_market', provider: 'polymarket', symbol: 'fed_rate_cut_prob', timeframe: '1d', timestamp: '2026-06-04T00:00:00.000Z' },
    ],
    errors: [
      { provider: 'macro', symbol: 'US02YIELD', message: 'No macro provider resolved successfully' },
      { provider: 'prediction_market', symbol: 'fed_rate_cut_prob', message: 'No prediction_market provider resolved successfully' },
    ],
  }, ['--event', 'fed_rate_cut_prob', '--history-days', '30', '--timeframe', '1d']);

  assert.equal(payload.sources, 1);
  assert.equal(payload.errors.length, 1);
  assert.equal(payload.errors[0].provider, 'prediction_market');
  assert.equal(payload.output, 'storage/data/cache/prediction_market/backtest_history.json');
});

test('data-quality errors use the shorter validation message', () => {
  const message = backtestDataQualityError({
    ok: false,
    counts: { error: 2 },
    provider_errors: [{}, {}],
    freshness: { stale_records: 1 },
  }, []);

  assert.match(message, /^Data-quality validation failed: 2 errors, 2 provider errors, 1 stale records\./);
  assert.doesNotMatch(message, /Backtest input failed data-quality validation/);
});

test('model comparison wraps the shorter validation message cleanly', () => {
  const quality = {
    ok: false,
    counts: { error: 2 },
    provider_errors: [{}, {}],
    freshness: { stale_records: 1 },
  };
  const args = [];
  const seen = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (...items) => seen.push(items.join(' '));
  console.log = (...items) => seen.push(items.join(' '));
  try {
    const triggered = rejectDegradedResearchInput(quality, args, 'Model comparison');
    assert.equal(triggered, true);
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }

  const output = seen.join('\n');
  assert.match(output, /Model comparison input failed data-quality validation\./);
  assert.doesNotMatch(output, /Backtest input failed data-quality validation/);
});

test('backtest payload exposes prop firm expectancy', () => {
  const payload = backtestSummaryPayload({
    generated_at: '2026-06-01T00:00:00.000Z',
    source_mode: 'live',
    data_quality_ok: true,
    data_quality_summary: null,
    trust_assessment: null,
    strategy: 'demo',
    strategy_source: 'config/strategies/demo.yaml',
    strategy_family: 'single',
    strategy_lane: 'single',
    strategy_role: 'core',
    strategy_universe: ['SPY'],
    strategy_asset_mode: 'single_asset',
    model: 'cnn_v0',
    timeframe: '1d',
    period: {},
    threshold: 0.55,
    data_start: '2026-01-01T00:00:00.000Z',
    data_end: '2026-02-01T00:00:00.000Z',
    data_bars: 10,
    oos_start_at: '2026-01-15T00:00:00.000Z',
    oos_end_at: '2026-02-01T00:00:00.000Z',
    oos_bars: 5,
    run_started_at: '2026-06-01T00:00:00.000Z',
    run_ended_at: '2026-06-01T00:01:00.000Z',
    runtime_ms: 60000,
    metrics: {
      trades: 2,
      net_return: 0.12,
      max_drawdown: 0.04,
      profit_factor: 1.2,
      sharpe_ratio: 1.1,
      sortino_ratio: 1.4,
      average_win: 0.05,
      average_loss: -0.03,
      payoff_ratio: 1.6,
      win_rate: 0.5,
      expected_value: 0.02,
      time_weighted_variance: 0.0002,
      time_weighted_stddev: 0.014,
      daily_summary: null,
      tail_risk: {},
      monte_carlo: {},
      prop_firm: {
        profile_id: 'custom',
        profile_name: 'Custom',
        firm: 'Custom',
        account_type: 'one_step',
        step_count: 1,
        grade: 'B',
        score: 82,
        verdict: 'likely-pass',
        passable: true,
        trading_days: 4,
        max_daily_loss_usage: 0.4,
        max_total_loss_usage: 0.2,
        best_day_share_of_positive_profit: 0.3,
        time_weighted_variance: 0.0002,
        warnings: [],
      },
    },
    benchmarks: {},
    trades: [],
    prop_firm_profile: null,
    walk_forward: null,
  }, { metrics: { net_return: 0.05 } }, 'out.json');

  assert.ok(payload.prop_firm_expectancy);
  assert.equal(payload.prop_firm_expectancy.score, 82);
  assert.equal(payload.prop_firm_expectancy.grade, 'B');
  assert.equal(payload.prop_firm_expectancy.passable, true);
  assert.equal(payload.prop_firm_expectancy.max_daily_loss_usage, 0.4);
  assert.equal(payload.prop_firm_expectancy.max_total_loss_usage, 0.2);
  assert.equal(payload.strategy_asset_mode, 'single_asset');
});
