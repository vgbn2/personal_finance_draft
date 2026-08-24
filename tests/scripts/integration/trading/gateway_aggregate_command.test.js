const assert = require('node:assert/strict');
const test = require('node:test');

require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  experimentalResolver: true,
  compilerOptions: {
    module: 'CommonJS', moduleResolution: 'node', target: 'ES2020', esModuleInterop: true,
    ignoreDeprecations: '6.0',
  },
});

const {
  projectAggregatePortfolio,
  runAggregatePortfolioCommand,
} = require('../../../../backend/gateway/src/commands/aggregate_portfolio.ts');

function inputs() {
  return {
    liveResults: [
      {
        name: 'Alpaca Live', ok: true, balance: { USD: 100, EQUITY: 120 },
        positions: [{ symbol: 'AAPL', quantity: 2, averagePrice: 10, marketValue: 20, unrealizedPl: 2 }],
      },
      {
        name: 'Gate.io', ok: true, balance: { USDT: 50 },
        positions: [{ symbol: 'AAPL', quantity: 1, averagePrice: 20, marketValue: 20, unrealizedPl: 1 }],
      },
    ],
    livePaperResults: [{ name: 'Alpaca Paper', ok: false, error: 'fixture unavailable' }],
    polymarket: {
      ok: true, configured: true, balance: { pUSD: 25 }, positions: [
        { symbol: 'Prediction… YES', quantity: 2, averagePrice: 0.2, marketValue: 1, unrealizedPl: 0.6, lifecycle: 'active', valuationStatus: 'live_quote' },
      ],
    },
    internalPaperPortfolio: {
      virtual_balance: 90, starting_balance: 100,
      positions: [{ question: 'Fixture question', outcome: 'YES', shares: 20, avg_price: 0.5 }],
    },
  };
}

test('aggregate projection preserves schema, broker failures, deduplication, and internal paper', () => {
  const projected = projectAggregatePortfolio(inputs());
  assert.deepEqual(Object.keys(projected), ['live', 'live_paper', 'paper']);
  assert.equal(projected.live.positions.length, 2);
  assert.deepEqual(projected.live.positions[0], {
    symbol: 'AAPL', quantity: 3, averagePrice: 13.3333, marketValue: 40, unrealizedPl: 3,
  });
  assert.equal(projected.live_paper.brokers[0].status, 'error');
  assert.equal(projected.paper.open_positions, 1);
  assert.equal(projected.paper.equity_marked_at_cost, 100);
});

test('aggregate command renders JSON and human fixtures without broker callbacks', async () => {
  for (const useJson of [true, false]) {
    const calls = [];
    const source = { async collect(scope) { assert.equal(scope, 'both'); return inputs(); } };
    const success = await runAggregatePortfolioCommand({
      scope: 'both', source, useJson,
      output: {
        log(...values) { calls.push(['log', ...values]); },
        error(...values) { calls.push(['error', ...values]); },
      },
    });
    assert.equal(success, true);
    if (useJson) assert.deepEqual(Object.keys(JSON.parse(calls[0][1])), ['live', 'live_paper', 'paper']);
    else assert.ok(calls.some((call) => String(call[1]).includes('LIVE  (real funds')));
  }
});

test('aggregate complete source failure is observable in JSON and human modes', async () => {
  for (const useJson of [true, false]) {
    const calls = [];
    const success = await runAggregatePortfolioCommand({
      scope: 'both', useJson,
      source: { async collect() { throw new Error('aggregate fixture failure'); } },
      output: {
        log(...values) { calls.push(['log', ...values]); },
        error(...values) { calls.push(['error', ...values]); },
      },
    });
    assert.equal(success, false);
    assert.match(JSON.stringify(calls), /aggregate fixture failure/);
    assert.ok(calls.some((call) => call[0] === (useJson ? 'log' : 'error')
      && String(call[1]).includes('aggregate fixture failure')));
  }
});
