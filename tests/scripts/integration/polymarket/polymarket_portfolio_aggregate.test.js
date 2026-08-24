const assert = require('node:assert/strict');
const test = require('node:test');

require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  experimentalResolver: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'node',
    target: 'ES2020',
    esModuleInterop: true,
    ignoreDeprecations: '6.0',
  },
});

const { buildAggregatedPortfolioSnapshot } = require('../../../../backend/gateway/src/polymarket/index.ts');

test('aggregate portfolio synthetic fixture includes Polymarket pUSD in totals and sidecar output', () => {
  const snapshot = buildAggregatedPortfolioSnapshot(
    [
      {
        name: 'Alpaca (Paper)',
        ok: true,
        balance: { USD: 100, EQUITY: 120 },
        positions: [{ symbol: 'AAPL', quantity: 2, averagePrice: 10, marketValue: 20, unrealizedPl: 0 }],
      },
    ],
    {
      ok: true,
      configured: true,
      balance: { pUSD: 50 },
      positions: [
        {
          symbol: 'Will X happen? (Yes)',
          quantity: 10,
          averagePrice: 0.5,
          marketValue: 8,
          unrealizedPl: 3,
          lifecycle: 'active',
          valuationStatus: 'live_quote',
        },
      ],
    }
  );

  assert.equal(snapshot.total_usd, 150);
  assert.equal(snapshot.total_equity, 178);
  assert.equal(snapshot.total_unrealized_pl, 3);
  assert.equal(snapshot.cost_basis_unavailable_positions, 0);
  assert.equal(snapshot.valuation_unavailable_positions, 0);
  assert.equal(snapshot.brokers.length, 2);
  assert.equal(snapshot.brokers[1].name, 'Polymarket');
  assert.equal(snapshot.brokers[1].status, 'connected');
  assert.equal(snapshot.brokers[1].position_count, 1);
});

test('aggregate portfolio handles unconfigured/failing Polymarket sidecar gracefully', () => {
  const snapshot = buildAggregatedPortfolioSnapshot([], {
    ok: false,
    configured: true,
    error: 'Polymarket credentials not configured',
  });

  assert.equal(snapshot.total_usd, 0);
  assert.equal(snapshot.total_equity, 0);
  assert.equal(snapshot.brokers.length, 1);
  assert.equal(snapshot.brokers[0].name, 'Polymarket');
  assert.equal(snapshot.brokers[0].status, 'error');
});
