'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateMarketFillCost,
  detectSumToOneArbitrage,
  evaluateNegRiskConversion,
} = require('../../../../shared/lib/strategy/polymarket_clob_model.js');
const {
  PolymarketAdapter,
} = require('../../../../backend/gateway/dist/adapters/polymarket_adapter.js');
const {
  commandBackend,
} = require('../../../../backend/cli/commands/tools/backend.js');

test('calculateMarketFillCost calculates depth-weighted VWAP and level consumption', () => {
  const asks = [
    { price: 0.30, size: 50 },
    { price: 0.32, size: 100 },
    { price: 0.35, size: 200 },
  ];

  // Request 25 shares (Level 1 only: 25 * 0.30 = 7.50)
  const fillL1 = calculateMarketFillCost(asks, 25);
  assert.equal(fillL1.fullyFilled, true);
  assert.equal(fillL1.totalFilled, 25);
  assert.equal(fillL1.totalCost, 7.5);
  assert.equal(fillL1.vwap, 0.30);
  assert.equal(fillL1.levelsUsed, 1);

  // Request 75 shares (Level 1: 50 * 0.30 = 15.00, Level 2: 25 * 0.32 = 8.00 -> Total = 23.00, VWAP = 23/75 = 0.30666...)
  const fillL2 = calculateMarketFillCost(asks, 75);
  assert.equal(fillL2.fullyFilled, true);
  assert.equal(fillL2.totalFilled, 75);
  assert.equal(fillL2.totalCost, 23.0);
  assert.ok(Math.abs(fillL2.vwap - 0.30666) < 0.001);
  assert.equal(fillL2.levelsUsed, 2);

  // Request 500 shares (Exceeds available depth of 350 shares)
  const fillOversize = calculateMarketFillCost(asks, 500);
  assert.equal(fillOversize.fullyFilled, false);
  assert.equal(fillOversize.totalFilled, 350);
  assert.equal(fillOversize.remainingShares, 150);
});

test('detectSumToOneArbitrage accurately detects profitable multi-outcome bundles', () => {
  // Profitable bundle: sum of asks = 0.30 + 0.32 + 0.28 = 0.90
  const outcomesProfitable = [
    { outcomeId: 'A', name: 'Candidate A', tokenId: 'tok-A', bestAsk: 0.30 },
    { outcomeId: 'B', name: 'Candidate B', tokenId: 'tok-B', bestAsk: 0.32 },
    { outcomeId: 'C', name: 'Candidate C', tokenId: 'tok-C', bestAsk: 0.28 },
  ];

  const arb = detectSumToOneArbitrage(outcomesProfitable, {
    targetShares: 10,
    takerFeeRate: 0.001,
    slippageReserve: 0.002,
    minEdge: 0.005,
  });

  assert.equal(arb.valid, true);
  assert.equal(arb.hasArbitrage, true);
  assert.ok(arb.edge > 0.09);
  assert.ok(arb.expectedProfit > 0.90);
  assert.equal(arb.legs.length, 3);
  assert.equal(arb.allLegsFilled, true);

  // Unprofitable bundle: sum of asks = 0.40 + 0.40 + 0.30 = 1.10
  const outcomesUnprofitable = [
    { outcomeId: 'A', name: 'Candidate A', tokenId: 'tok-A', bestAsk: 0.40 },
    { outcomeId: 'B', name: 'Candidate B', tokenId: 'tok-B', bestAsk: 0.40 },
    { outcomeId: 'C', name: 'Candidate C', tokenId: 'tok-C', bestAsk: 0.30 },
  ];

  const noArb = detectSumToOneArbitrage(outcomesUnprofitable, { targetShares: 10 });
  assert.equal(noArb.valid, true);
  assert.equal(noArb.hasArbitrage, false);
  assert.ok(noArb.edge < 0);
  assert.equal(noArb.expectedProfit, 0);
});

test('evaluateNegRiskConversion determines token conversion parity and action', () => {
  // Holding NO priced at 0.70 vs buying complementary YES at 0.32 + 0.33 = 0.65
  // Edge = 0.70 - 0.65 = +0.05 -> Recommend buy complementary YES
  const eval1 = evaluateNegRiskConversion(0.70, [0.32, 0.33]);
  assert.equal(eval1.canConvert, true);
  assert.ok(eval1.conversionEdge > 0.04);
  assert.equal(eval1.recommendation, 'buy_complementary_yes');

  // Holding NO priced at 0.60 vs buying complementary YES at 0.35 + 0.35 = 0.70
  // Edge = 0.60 - 0.70 = -0.10 -> Recommend buy direct NO
  const eval2 = evaluateNegRiskConversion(0.60, [0.35, 0.35]);
  assert.equal(eval2.canConvert, true);
  assert.ok(eval2.conversionEdge < -0.09);
  assert.equal(eval2.recommendation, 'buy_direct_no');
});

test('PolymarketAdapter.placeMultiOutcomeBundleOrder executes zero-key simulated bundle order', async () => {
  const adapter = new PolymarketAdapter({
    simulateIfMissingCredentials: true,
  });

  const orders = [
    { instrumentId: 'token-A', side: 'buy', quantity: 10, price: 0.30, type: 'limit' },
    { instrumentId: 'token-B', side: 'buy', quantity: 10, price: 0.35, type: 'limit' },
    { instrumentId: 'token-C', side: 'buy', quantity: 10, price: 0.25, type: 'limit' },
  ];

  const result = await adapter.placeMultiOutcomeBundleOrder(orders);
  assert.notEqual(result.bundleId, null);
  assert.equal(result.status, 'SUBMITTED');
  assert.equal(result.totalOrders, 3);
  assert.equal(result.results.length, 3);
  assert.equal(result.results[0].instrumentId, 'token-A');
});

test('commandBackend polymarket-bundle CLI execution returns status code 0', async () => {
  const code = await commandBackend(['polymarket-bundle', '--shares', '5', '--json']);
  assert.equal(code, 0);
});
