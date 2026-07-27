const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Set a known token before app.js is required so the PROTECTED_GET_ROUTES
// auth gate operates with a non-empty API_TOKEN during this test suite.
// Tests that exercise unauthenticated access deliberately omit the header.
const TEST_API_TOKEN = 'test-sentinel-token-api-suite';
process.env.SOVEREIGN_API_TOKEN = TEST_API_TOKEN;

const { server, io, DEFAULT_SNAPSHOT, PROTECTED_GET_ROUTES } = require('../app');

const BACKEND_HISTORY_FIXTURE = path.join(__dirname, '../../..', 'tests', 'fixtures', 'backend_history_sample.json');

function query(params) {
  return new URLSearchParams(params).toString();
}

function bundlePathFromHtml(html) {
  const match = html.match(/<script type="module"[^>]*src="([^"]+)"/i);
  return match ? match[1] : null;
}

function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(DEFAULT_SNAPSHOT)) {
      fs.unwatchFile(DEFAULT_SNAPSHOT);
    }
    io.close();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('web API exposes backend health, data summary, and correlation', async (t) => {
  const savedQuoteEnv = {
    SOVEREIGN_MT5_QUOTES_PATH: process.env.SOVEREIGN_MT5_QUOTES_PATH,
    MT5_QUOTES_PATH: process.env.MT5_QUOTES_PATH,
    SOVEREIGN_WEBULL_QUOTES_PATH: process.env.SOVEREIGN_WEBULL_QUOTES_PATH,
    WEBULL_QUOTES_PATH: process.env.WEBULL_QUOTES_PATH,
  };
  delete process.env.SOVEREIGN_MT5_QUOTES_PATH;
  delete process.env.MT5_QUOTES_PATH;
  delete process.env.SOVEREIGN_WEBULL_QUOTES_PATH;
  delete process.env.WEBULL_QUOTES_PATH;
  const signalFixtureRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'sovereign-api-signal-'));
  t.after(() => fs.rmSync(signalFixtureRoot, { recursive: true, force: true }));
  const modelReportPath = path.join(signalFixtureRoot, 'model.json');
  const backtestReportPath = path.join(signalFixtureRoot, 'backtest.json');
  fs.writeFileSync(modelReportPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    source_mode: 'test_fixture',
    data_quality_ok: true,
    horizon: 2,
    threshold: 0.55,
    candidate_count: 0,
    families: ['trees'],
    per_symbol_winners: [],
  }));
  fs.writeFileSync(backtestReportPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    source_mode: 'test_fixture',
    data_quality_ok: true,
    model: 'fixture-model',
    equity_curve: [
      { timestamp: '2026-01-01T00:00:00.000Z', equity: 1 },
      { timestamp: '2026-01-02T00:00:00.000Z', equity: 1.01 },
      { timestamp: '2026-01-03T00:00:00.000Z', equity: 1.02 },
    ],
  }));
  const baseUrl = await listen();
  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);

    const index = await fetch(`${baseUrl}/`);
    assert.equal(index.status, 200);
    const indexHtml = await index.text();
    assert.match(indexHtml, /Sovereign Web Dashboard/);
    const bundlePath = bundlePathFromHtml(indexHtml);
    assert.ok(bundlePath, 'Expected served HTML to include a module script');

    const appBundle = await fetch(`${baseUrl}${bundlePath}`);
    assert.equal(appBundle.status, 200);
    assert.match(appBundle.headers.get('content-type') || '', /javascript/);
    assert.match(await appBundle.text(), /\/api\/system\/status/);

    const unauthenticatedOverride = await fetch(`${baseUrl}/api/data/summary?${query({
      input: BACKEND_HISTORY_FIXTURE,
    })}`);
    assert.equal(unauthenticatedOverride.status, 401);
    assert.equal((await unauthenticatedOverride.json()).error, 'authentication_required');

    const summary = await fetch(`${baseUrl}/api/data/summary?${query({
      symbol: 'AAPL',
      timeframe: '1d',
      max_bars: '5',
      input: BACKEND_HISTORY_FIXTURE,
    })}`, { headers: { 'X-Sovereign-Token': TEST_API_TOKEN } });
    assert.equal(summary.status, 200);
    const summaryPayload = await summary.json();
    assert.equal(summaryPayload.type, 'market_data_summary');
    assert.equal(summaryPayload.ok, true);
    assert.equal(summaryPayload.summary.symbol, 'AAPL');
    assert.equal(summaryPayload.quality.rejected_records, 0);

    const correlation = await fetch(`${baseUrl}/api/correlation?${query({
      symbols: 'AAPL,MSFT,SPY',
      timeframe: '1d',
      max_bars: '4',
      input: BACKEND_HISTORY_FIXTURE,
    })}`, { headers: { 'X-Sovereign-Token': TEST_API_TOKEN } });
    assert.equal(correlation.status, 200);
    const correlationPayload = await correlation.json();
    assert.equal(correlationPayload.type, 'correlation_matrix');
    assert.deepEqual(correlationPayload.labels, ['AAPL', 'MSFT', 'SPY']);
    assert.equal(correlationPayload.values.length, 3);
    assert.equal(correlationPayload.values[0][0], 1);

    const weeklyCorrelation = await fetch(`${baseUrl}/api/correlation?${query({
      symbols: 'AAPL,MSFT,SPY',
      timeframe: '1w',
      max_bars: '252',
      input: BACKEND_HISTORY_FIXTURE,
    })}`, { headers: { 'X-Sovereign-Token': TEST_API_TOKEN } });
    assert.equal(weeklyCorrelation.status, 200);
    const weeklyPayload = await weeklyCorrelation.json();
    assert.equal(weeklyPayload.type, 'correlation_matrix');
    assert.deepEqual(weeklyPayload.labels, ['AAPL', 'MSFT', 'SPY']);
    assert.ok(weeklyPayload.sample_size > 0);

    const monthlyCorrelation = await fetch(`${baseUrl}/api/correlation?${query({
      symbols: 'AAPL,MSFT,SPY',
      timeframe: '1mo',
      max_bars: '252',
      input: BACKEND_HISTORY_FIXTURE,
    })}`, { headers: { 'X-Sovereign-Token': TEST_API_TOKEN } });
    assert.equal(monthlyCorrelation.status, 200);
    const monthlyPayload = await monthlyCorrelation.json();
    assert.equal(monthlyPayload.type, 'correlation_matrix');
    assert.deepEqual(monthlyPayload.labels, ['AAPL', 'MSFT', 'SPY']);
    assert.ok(monthlyPayload.sample_size > 0);

    const universe = await fetch(`${baseUrl}/api/universe?${query({
      max_entries: '5',
      input: BACKEND_HISTORY_FIXTURE,
    })}`, { headers: { 'X-Sovereign-Token': TEST_API_TOKEN } });
    assert.equal(universe.status, 200);
    const universePayload = await universe.json();
    assert.equal(universePayload.type, 'market_universe');
    assert.ok(Array.isArray(universePayload.entries));
    assert.ok(universePayload.entries.some((entry) => entry.symbol === 'AAPL'));

    const system = await fetch(`${baseUrl}/api/system/status`, {
      headers: { 'X-Sovereign-Token': TEST_API_TOKEN },
    });
    assert.equal(system.status, 200);
    const systemPayload = await system.json();
    assert.equal(systemPayload.type, 'system_status');
    assert.match(systemPayload.components.cli.cli_path, /backend[\\\\/]cli[\\\\/]sovereign_cli\.js/);
    assert.ok(systemPayload.components.cli.usable_records >= 0);
    assert.ok(Array.isArray(systemPayload.components.quotes.providers));
    assert.equal(systemPayload.components.deployment.effective_profile, 'developer');
    assert.equal(systemPayload.components.deployment.canonical_writer, false);
    assert.equal(systemPayload.components.auth.access_policy, 'capability-rbac-v1');

    const quotes = await fetch(`${baseUrl}/api/quotes/status`, {
      headers: { 'X-Sovereign-Token': TEST_API_TOKEN },
    });
    assert.equal(quotes.status, 200);
    const quotesPayload = await quotes.json();
    assert.equal(quotesPayload.type, 'quote_sources');
    assert.equal(typeof quotesPayload.ok, 'boolean');
    assert.ok(Array.isArray(quotesPayload.providers));
    assert.ok(quotesPayload.providers.some((provider) => provider.provider === 'mt5'));
    assert.equal(quotesPayload.deduplication.policy, 'provider_priority_then_quality');

    const signal = await fetch(`${baseUrl}/api/signal?${query({
      input: BACKEND_HISTORY_FIXTURE,
      model_report: modelReportPath,
      backtest_report: backtestReportPath,
    })}`, { headers: { 'X-Sovereign-Token': TEST_API_TOKEN } });
    assert.equal(signal.status, 200);
    const signalPayload = await signal.json();
    assert.equal(signalPayload.type, 'signal_status');
    assert.equal(signalPayload.source, 'model_comparison');
    assert.ok(Array.isArray(signalPayload.signals));
    assert.ok(signalPayload.signals.length > 0);
    assert.ok(signalPayload.model.candidate_count >= signalPayload.signals.length);
    assert.ok(signalPayload.model.families.includes('trees'));
    assert.equal(signalPayload.quality.promotion_required, true);
    assert.equal(signalPayload.backtest.available, true);
    assert.equal(typeof signalPayload.backtest.model, 'string');
    assert.ok(signalPayload.backtest.model.length > 0);

    const backtest = await fetch(`${baseUrl}/api/backtest?${query({
      input: backtestReportPath,
    })}`, {
      headers: { 'X-Sovereign-Token': TEST_API_TOKEN },
    });
    assert.equal(backtest.status, 200);
    const backtestPayload = await backtest.json();
    assert.equal(backtestPayload.type, 'backtest_summary');
    assert.equal(backtestPayload.stats.type, 'backend_stats');
    assert.equal(backtestPayload.stats.ok, true);
    assert.ok(typeof backtestPayload.stats.equity_source === 'string');
    assert.equal(backtestPayload.stats.equity_source, backtestReportPath);
    assert.equal(typeof backtestPayload.summary.available, 'boolean');
    if (backtestPayload.summary.available) {
      assert.equal(typeof backtestPayload.summary.model, 'string');
      assert.ok(backtestPayload.summary.model.length > 0);
    }

    const portfolio = await fetch(`${baseUrl}/api/backend/portfolio`);
    assert.equal(portfolio.status, 401);

    const strategies = await fetch(`${baseUrl}/api/strategies`, {
      headers: { 'X-Sovereign-Token': TEST_API_TOKEN },
    });
    assert.equal(strategies.status, 200);
    const strategiesPayload = await strategies.json();
    assert.equal(strategiesPayload.type, 'strategy_catalog');
    assert.ok(Array.isArray(strategiesPayload.strategies));
    const executableStrategy = strategiesPayload.strategies.find((strategy) => strategy.name === 'mean_reversion');
    assert.equal(executableStrategy.family, 'mean_reversion');
    assert.equal(executableStrategy.lane, 'single_asset');
    assert.equal(executableStrategy.role, 'strategy');
    assert.ok(Object.prototype.hasOwnProperty.call(executableStrategy, 'grade'));
    assert.ok(strategiesPayload.strategies.some((strategy) => strategy.name === 'options_trading' && strategy.status === 'research_only'));
    const optionsStrategy = strategiesPayload.strategies.find((strategy) => strategy.name === 'options_trading');
    assert.equal(optionsStrategy.surface, 'research');
    assert.equal(optionsStrategy.execution, false);
    assert.equal(optionsStrategy.lane, 'cross_asset');
    assert.match(optionsStrategy.note, /no option-chain execution wired/i);

    const runStatus = await fetch(`${baseUrl}/api/run/status`, {
      headers: { 'X-Sovereign-Token': TEST_API_TOKEN },
    });
    assert.equal(runStatus.status, 200);
    const runStatusPayload = await runStatus.json();
    assert.equal(runStatusPayload.ok, true);
    assert.ok(typeof runStatusPayload.loops === 'object' && runStatusPayload.loops !== null, 'loops should be an object');

    const unauthenticatedScorecard = await fetch(`${baseUrl}/api/scorecard?family=crypto&top=2`);
    assert.equal(unauthenticatedScorecard.status, 401);

    const scorecardRequest = fetch(`${baseUrl}/api/scorecard?family=crypto&top=2`, {
      headers: { 'X-Sovereign-Token': TEST_API_TOKEN },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const healthDuringScorecardStart = Date.now();
    const healthDuringScorecard = await fetch(`${baseUrl}/health`);
    assert.equal(healthDuringScorecard.status, 200);
    assert.ok(Date.now() - healthDuringScorecardStart < 2000, 'scorecard worker must not block API health checks');
    const scorecard = await scorecardRequest;
    assert.equal(scorecard.status, 200);
    const scorecardPayload = await scorecard.json();
    assert.equal(scorecardPayload.ok, true);
    assert.equal(scorecardPayload.type, 'scorecard');
    assert.equal(scorecardPayload.schema_version, 2);
    assert.equal(scorecardPayload.filters.family, 'crypto');
    assert.equal(scorecardPayload.filters.top, 2);
    assert.ok(Array.isArray(scorecardPayload.rows));
    assert.ok(Array.isArray(scorecardPayload.exclusions));
    assert.ok(scorecardPayload.rows.length <= 2);
    assert.ok(scorecardPayload.total_symbols >= scorecardPayload.analyzed_symbols);

    const shadowScorecard = await fetch(`${baseUrl}/api/scorecard?schema=3&fixture=aapl-recorded`, {
      headers: { 'X-Sovereign-Token': TEST_API_TOKEN },
    });
    assert.equal(shadowScorecard.status, 200);
    const shadowPayload = await shadowScorecard.json();
    assert.equal(shadowPayload.type, 'analysis_shadow');
    assert.equal(shadowPayload.schema_version, 3);
    assert.equal(shadowPayload.research_only, true);
    assert.equal(shadowPayload.decision_ready, false);
    assert.equal(shadowPayload.fixture_id, 'aapl-recorded');
    assert.equal(shadowPayload.rows.length, 1);
    assert.equal(shadowPayload.counts.sec_observations, 1392);

    const missingShadowFixture = await fetch(`${baseUrl}/api/scorecard?schema=3`, {
      headers: { 'X-Sovereign-Token': TEST_API_TOKEN },
    });
    assert.equal(missingShadowFixture.status, 400);
    assert.equal((await missingShadowFixture.json()).error_code, 'invalid_fixture');

    const cachedScorecard = await fetch(`${baseUrl}/api/scorecard?family=crypto&top=2`, {
      headers: { 'X-Sovereign-Token': TEST_API_TOKEN },
    });
    assert.equal(cachedScorecard.status, 200);
    assert.equal((await cachedScorecard.json()).from_memory_cache, true);

    const invalidScorecard = await fetch(`${baseUrl}/api/scorecard?direction=sideways`, {
      headers: { 'X-Sovereign-Token': TEST_API_TOKEN },
    });
    assert.equal(invalidScorecard.status, 400);
    assert.equal((await invalidScorecard.json()).error_code, 'invalid_direction');

    const invalidScorecardTf = await fetch(`${baseUrl}/api/scorecard?tf=1h,2h`, {
      headers: { 'X-Sovereign-Token': TEST_API_TOKEN },
    });
    assert.equal(invalidScorecardTf.status, 400);
    assert.equal((await invalidScorecardTf.json()).error_code, 'invalid_timeframe');

    const scorecardPreflight = await fetch(`${baseUrl}/api/scorecard`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'X-Sovereign-Token',
      },
    });
    assert.equal(scorecardPreflight.status, 204);
    assert.equal(scorecardPreflight.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  } finally {
    await close();
    for (const [key, value] of Object.entries(savedQuoteEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('GET /api/kill-switch requires X-Sovereign-Token and rejects unauthenticated callers', async () => {
  const baseUrl = await listen();
  try {
    // 2a: unauthenticated request must be rejected with 401
    const unauthenticated = await fetch(`${baseUrl}/api/kill-switch?command=status`);
    assert.equal(unauthenticated.status, 401, 'kill-switch without token must return 401');

    // 2b: authenticated request must NOT return 401 (200 or 503 are both acceptable
    //     since the C++ backend may be unavailable in the test environment)
    const authenticated = await fetch(`${baseUrl}/api/kill-switch?command=status`, {
      headers: { 'X-Sovereign-Token': TEST_API_TOKEN },
    });
    assert.notEqual(authenticated.status, 401, 'kill-switch with valid token must not return 401');
  } finally {
    await close();
  }
});

test('authenticated API rejects oversized JSON bodies before route handling', async () => {
  const baseUrl = await listen();
  try {
    const response = await fetch(`${baseUrl}/api/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sovereign-Token': TEST_API_TOKEN,
      },
      body: JSON.stringify({ value: 'x'.repeat(1_048_577) }),
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, 'request_body_too_large');
  } finally {
    await close();
  }
});

test('every protected GET route rejects missing and malformed credentials', async () => {
  const baseUrl = await listen();
  try {
    assert.ok(PROTECTED_GET_ROUTES.size > 0);
    for (const route of PROTECTED_GET_ROUTES) {
      const missing = await fetch(`${baseUrl}${route}`);
      assert.equal(missing.status, 401, `${route} must reject missing credentials`);
      assert.equal((await missing.json()).error, 'authentication_required');

      const malformed = await fetch(`${baseUrl}${route}`, {
        headers: { Authorization: 'Basic not-a-bearer-token' },
      });
      assert.equal(malformed.status, 401, `${route} must reject malformed credentials`);
      assert.equal((await malformed.json()).error, 'authentication_required');
    }
  } finally {
    await close();
  }
});
