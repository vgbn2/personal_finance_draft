const assert = require('node:assert/strict');
const test = require('node:test');

const { buildAggregatedPortfolioSnapshot } = require('../../../../backend/gateway/src/polymarket_portfolio.js');

test('aggregate portfolio synthetic fixture includes Polymarket pUSD in totals and sidecar output', () => {
  // This is a pure math test. It proves the helper folds Polymarket pUSD into totals.
  // It does not assert anything about the live account balance.
  const snapshot = buildAggregatedPortfolioSnapshot(
    [
      {
        name: 'Alpaca (Paper)',
        ok: true,
        balance: { USD: 100, EQUITY: 120 },
        positions: [{ symbol: 'AAPL', quantity: 2, averagePrice: 10, marketValue: 20, unrealizedPl: 0 }],
      },
      {
        name: 'Gate.io',
        ok: true,
        balance: { USDT: 50 },
        positions: [{ symbol: 'BTC', quantity: 0.1, averagePrice: 0, marketValue: 6000, unrealizedPl: 999, cost_basis_unavailable: true }],
      },
    ],
    {
      ok: true,
      configured: true,
      balance: { pUSD: 25 },
      positions: [{ symbol: 'YES', quantity: 3, averagePrice: 0.5, marketValue: 1.5, unrealizedPl: 0 }],
    }
  );

  assert.equal(snapshot.total_usd, 175);
  assert.equal(snapshot.total_equity, 195);
  assert.equal(snapshot.brokers.length, 3);
  assert.equal(snapshot.brokers[2].name, 'Polymarket');
  assert.equal(snapshot.brokers[2].position_count, 1);
  assert.equal(snapshot.brokers[1].cost_basis_unavailable_count, 1);
  assert.equal(snapshot.cost_basis_unavailable_positions, 1);
  assert.equal(snapshot.total_unrealized_pl, 0);
  assert.equal(snapshot.prediction_markets.polymarket.balance.pUSD, 25);
  assert.equal(snapshot.positions.length, 3);
  assert.deepEqual(snapshot.positions.map((position) => position.symbol), ['AAPL', 'BTC', 'YES']);
});
