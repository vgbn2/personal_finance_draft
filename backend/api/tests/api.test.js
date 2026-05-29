const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { server, io, DEFAULT_SNAPSHOT } = require('../app');

const BACKEND_HISTORY_FIXTURE = path.join(__dirname, '..', '..', 'test', 'fixtures', 'backend_history_sample.json');

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

test('web API exposes backend health, data summary, and correlation', async () => {
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

    const summary = await fetch(`${baseUrl}/api/data/summary?${query({
      symbol: 'AAPL',
      timeframe: '1d',
      max_bars: '5',
      input: BACKEND_HISTORY_FIXTURE,
    })}`);
    assert.equal(summary.status, 200);
    const summaryPayload = await summary.json();
    assert.equal(summaryPayload.type, 'market_data_summary');
    assert.equal(summaryPayload.ok, true);
    assert.equal(summaryPayload.summary.symbol, 'AAPL');
    assert.equal(summaryPayload.quality.rejected_records, 0);

    const correlation = await fetch(`${baseUrl}/api/correlation?${query({
      symbols: 'AAPL,MSFT,SPX',
      timeframe: '1d',
      max_bars: '4',
      input: BACKEND_HISTORY_FIXTURE,
    })}`);
    assert.equal(correlation.status, 200);
    const correlationPayload = await correlation.json();
    assert.equal(correlationPayload.type, 'correlation_matrix');
    assert.deepEqual(correlationPayload.labels, ['AAPL', 'MSFT', 'SPX']);
    assert.equal(correlationPayload.values.length, 3);
    assert.equal(correlationPayload.values[0][0], 1);

    const universe = await fetch(`${baseUrl}/api/universe?${query({
      max_entries: '5',
      input: BACKEND_HISTORY_FIXTURE,
    })}`);
    assert.equal(universe.status, 200);
    const universePayload = await universe.json();
    assert.equal(universePayload.type, 'market_universe');
    assert.ok(Array.isArray(universePayload.entries));
    assert.ok(universePayload.entries.some((entry) => entry.symbol === 'AAPL'));

    const system = await fetch(`${baseUrl}/api/system/status`);
    assert.equal(system.status, 200);
    const systemPayload = await system.json();
    assert.equal(systemPayload.type, 'system_status');
    assert.match(systemPayload.components.cli.cli_path, /scripts[\\\\/]cli[\\\\/]sovereign_cli\.js/);
    assert.ok(systemPayload.components.cli.usable_records > 0);
    assert.ok(Array.isArray(systemPayload.components.quotes.providers));

    const quotes = await fetch(`${baseUrl}/api/quotes/status`);
    assert.equal(quotes.status, 200);
    const quotesPayload = await quotes.json();
    assert.equal(quotesPayload.type, 'quote_sources');
    assert.equal(typeof quotesPayload.ok, 'boolean');
    assert.ok(Array.isArray(quotesPayload.providers));
    assert.ok(quotesPayload.providers.some((provider) => provider.provider === 'mt5'));
    assert.equal(quotesPayload.deduplication.policy, 'provider_priority_then_quality');

    const signal = await fetch(`${baseUrl}/api/signal?${query({
      input: BACKEND_HISTORY_FIXTURE,
    })}`);
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
    assert.equal(signalPayload.backtest.model, 'cnn_window_v0');

    const backtest = await fetch(`${baseUrl}/api/backtest`);
    assert.equal(backtest.status, 200);
    const backtestPayload = await backtest.json();
    assert.equal(backtestPayload.type, 'backtest_summary');
    assert.equal(backtestPayload.stats.type, 'backend_stats');
    assert.equal(backtestPayload.stats.source, 'local_equity_curve');
    assert.equal(backtestPayload.stats.observations, 1);
    assert.equal(backtestPayload.stats.equity_source.endsWith(path.join('data', 'backtests', 'latest_backtest.json')), true);
  } finally {
    await close();
    for (const [key, value] of Object.entries(savedQuoteEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
